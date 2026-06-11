package library

import (
	"context"
	"fmt"
	"io/fs"

	"gorm.io/gorm"
)

type CollectionFile struct {
	ID       int64  `json:"id"`
	ParentID int64  `json:"parent_id"`
	Name     string `json:"name"`
	Mode     uint32 `json:"mode"`
	Size     int64  `json:"size"`
}

func (l *Library) ListFilesInCollection(ctx context.Context, collectionID, parentID int64, tapeIDs []int64, showHidden bool) ([]*CollectionFile, error) {
	if len(tapeIDs) == 0 {
		return []*CollectionFile{}, nil
	}

	// Get all file IDs from positions on these tapes
	var fileIDs []int64
	if err := l.db.WithContext(ctx).
		Model(ModelPosition).
		Where("file_id > 0 AND tape_id IN (?)", tapeIDs).
		Distinct("file_id").
		Pluck("file_id", &fileIDs).Error; err != nil {
		return nil, fmt.Errorf("get file ids from positions fail, %w", err)
	}

	if len(fileIDs) == 0 {
		return []*CollectionFile{}, nil
	}

	// Get all ancestors of these files up to the parent
	ancestorIDs, err := l.getAncestorsUntil(ctx, fileIDs, parentID)
	if err != nil {
		return nil, fmt.Errorf("get ancestor file ids fail, %w", err)
	}

	// Combine file IDs and ancestor IDs
	allIDs := make(map[int64]bool)
	for _, id := range fileIDs {
		allIDs[id] = true
	}
	for _, id := range ancestorIDs {
		allIDs[id] = true
	}

	// Get direct children of parentID that are in the set
	files := make([]*File, 0, 50)
	query := l.db.WithContext(ctx).Where("parent_id = ? AND id IN (?)", parentID, keys(allIDs))
	if !showHidden {
		query = query.Where("name NOT LIKE '.%'")
	}
	if r := query.Order("name ASC").Find(&files); r.Error != nil {
		return nil, fmt.Errorf("list files in collection fail, %w", r.Error)
	}

	result := make([]*CollectionFile, 0, len(files))
	for _, f := range files {
		// For directories, calculate recursive size from positions
		size := f.Size
		if fs.FileMode(f.Mode).IsDir() {
			size = l.getDirSizeInCollection(ctx, f.ID, fileIDs)
		}
		result = append(result, &CollectionFile{
			ID:       f.ID,
			ParentID: f.ParentID,
			Name:     f.Name,
			Mode:     f.Mode,
			Size:     size,
		})
	}

	return result, nil
}

func (l *Library) getAncestorsUntil(ctx context.Context, fileIDs []int64, stopAtID int64) ([]int64, error) {
	ancestors := make(map[int64]bool)
	currentIDs := fileIDs

	for len(currentIDs) > 0 {
		// Check if any of these are direct children of stopAtID
		files := make([]*File, 0, len(currentIDs))
		if r := l.db.WithContext(ctx).Where("id IN (?)", currentIDs).Find(&files); r.Error != nil {
			return nil, fmt.Errorf("get ancestors fail, %w", r.Error)
		}

		nextIDs := make([]int64, 0, len(files))
		for _, f := range files {
			if f.ParentID == stopAtID {
				continue // reached the boundary
			}
			if f.ParentID == 0 {
				continue // at root, stop
			}
			if ancestors[f.ParentID] {
				continue // already have this ancestor
			}
			ancestors[f.ParentID] = true
			nextIDs = append(nextIDs, f.ParentID)
		}
		currentIDs = nextIDs
		if len(currentIDs) > 1000 {
			break // safety limit
		}
	}

	result := make([]int64, 0, len(ancestors))
	for id := range ancestors {
		result = append(result, id)
	}
	return result, nil
}

func (l *Library) getDirSizeInCollection(ctx context.Context, dirID int64, collectionFileIDs []int64) int64 {
	var total int64
	// Get direct children
	files := make([]*File, 0, 20)
	if r := l.db.WithContext(ctx).Where("parent_id = ?", dirID).Find(&files); r.Error != nil {
		return 0
	}
	for _, f := range files {
		if fs.FileMode(f.Mode).IsDir() {
			total += l.getDirSizeInCollection(ctx, f.ID, collectionFileIDs)
		} else if contains(collectionFileIDs, f.ID) {
			total += f.Size
		}
	}
	return total
}

func keys(m map[int64]bool) []int64 {
	r := make([]int64, 0, len(m))
	for k := range m {
		r = append(r, k)
	}
	return r
}

func contains(slice []int64, val int64) bool {
	for _, v := range slice {
		if v == val {
			return true
		}
	}
	return false
}

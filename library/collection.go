package library

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
)

var (
	ModelCollection      = new(Collection)
	ModelCollectionTape  = new(CollectionTape)
)

type Collection struct {
	ID          int64      `gorm:"primaryKey;autoIncrement" json:"id,omitempty"`
	Name        string     `gorm:"type:varchar(256);index:idx_collection_name,unique" json:"name,omitempty"`
	Description string     `gorm:"type:varchar(1024)" json:"description,omitempty"`
	CreatedAt   time.Time  `json:"created_at,omitempty"`
	UpdatedAt   time.Time  `json:"updated_at,omitempty"`
}

type CollectionTape struct {
	CollectionID int64 `gorm:"primaryKey;index:idx_ct_collection" json:"collection_id,omitempty"`
	TapeID       int64 `gorm:"primaryKey;index:idx_ct_tape" json:"tape_id,omitempty"`
	CreatedAt    time.Time `json:"created_at,omitempty"`
}

func (l *Library) CreateCollection(ctx context.Context, name, description string) (*Collection, error) {
	c := &Collection{
		Name:        name,
		Description: description,
	}
	if r := l.db.WithContext(ctx).Create(c); r.Error != nil {
		return nil, fmt.Errorf("create collection fail, %w", r.Error)
	}
	return c, nil
}

func (l *Library) ListCollections(ctx context.Context) ([]*Collection, error) {
	cols := make([]*Collection, 0, 10)
	if r := l.db.WithContext(ctx).Order("name ASC").Find(&cols); r.Error != nil {
		return nil, fmt.Errorf("list collections fail, %w", r.Error)
	}
	return cols, nil
}

func (l *Library) GetCollection(ctx context.Context, id int64) (*Collection, error) {
	c := new(Collection)
	if r := l.db.WithContext(ctx).First(c, id); r.Error != nil {
		return nil, fmt.Errorf("get collection fail, %w", r.Error)
	}
	return c, nil
}

func (l *Library) DeleteCollection(ctx context.Context, id int64) error {
	return l.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if r := tx.Where("collection_id = ?", id).Delete(ModelCollectionTape); r.Error != nil {
			return fmt.Errorf("delete collection tapes fail, %w", r.Error)
		}
		if r := tx.Delete(ModelCollection, id); r.Error != nil {
			return fmt.Errorf("delete collection fail, %w", r.Error)
		}
		return nil
	})
}

func (l *Library) AddTapeToCollection(ctx context.Context, collectionID, tapeID int64) error {
	ct := &CollectionTape{
		CollectionID: collectionID,
		TapeID:       tapeID,
	}
	if r := l.db.WithContext(ctx).Where("collection_id = ? AND tape_id = ?", collectionID, tapeID).FirstOrCreate(ct); r.Error != nil {
		return fmt.Errorf("add tape to collection fail, %w", r.Error)
	}
	return nil
}

func (l *Library) RemoveTapeFromCollection(ctx context.Context, collectionID, tapeID int64) error {
	if r := l.db.WithContext(ctx).Where("collection_id = ? AND tape_id = ?", collectionID, tapeID).Delete(ModelCollectionTape); r.Error != nil {
		return fmt.Errorf("remove tape from collection fail, %w", r.Error)
	}
	return nil
}

func (l *Library) ListCollectionTapes(ctx context.Context, collectionID int64) ([]int64, error) {
	cts := make([]*CollectionTape, 0, 10)
	if r := l.db.WithContext(ctx).Where("collection_id = ?", collectionID).Find(&cts); r.Error != nil {
		return nil, fmt.Errorf("list collection tapes fail, %w", r.Error)
	}
	ids := make([]int64, 0, len(cts))
	for _, ct := range cts {
		ids = append(ids, ct.TapeID)
	}
	return ids, nil
}

func (l *Library) ListCollectionsForTape(ctx context.Context, tapeID int64) ([]*Collection, error) {
	cts := make([]*CollectionTape, 0, 5)
	if r := l.db.WithContext(ctx).Where("tape_id = ?", tapeID).Find(&cts); r.Error != nil {
		return nil, fmt.Errorf("list tape collections fail, %w", r.Error)
	}
	ids := make([]int64, 0, len(cts))
	for _, ct := range cts {
		ids = append(ids, ct.CollectionID)
	}
	if len(ids) == 0 {
		return []*Collection{}, nil
	}
	cols := make([]*Collection, 0, len(ids))
	if r := l.db.WithContext(ctx).Where("id IN (?)", ids).Find(&cols); r.Error != nil {
		return nil, fmt.Errorf("get collections by ids fail, %w", r.Error)
	}
	return cols, nil
}

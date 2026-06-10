package entity

import (
	"path"
	"strings"

	"github.com/samuelncui/acp"
)

func NewSourceFromACPJob(job *acp.Job) *Source {
	// ACP v0.0.0-20260313 changed Path from []string to string
	// Split the path into segments for backward compatibility
	var pathSegments []string
	if job.Path != "" {
		pathSegments = strings.Split(job.Path, "/")
	}
	return &Source{Base: job.Base, Path: pathSegments}
}

func (x *Source) RealPath() string {
	p := make([]string, 0, len(x.Path)+1)
	p = append(p, x.Base)
	p = append(p, x.Path...)
	return path.Join(p...)
}

func (x *Source) Append(more ...string) *Source {
	p := make([]string, len(x.Path)+len(more))
	copy(p, x.Path)
	copy(p[len(x.Path):], more)

	return &Source{Base: x.Base, Path: p}
}

func (x *Source) Compare(xx *Source) int {
	la, lb := len(x.Path), len(xx.Path)

	l := la
	if lb < la {
		l = lb
	}

	for idx := 0; idx < l; idx++ {
		if x.Path[idx] < xx.Path[idx] {
			return -1
		}
		if x.Path[idx] > xx.Path[idx] {
			return 1
		}
	}

	if la < lb {
		return -1
	}
	if la > lb {
		return 1
	}

	if x.Base < xx.Base {
		return -1
	}
	if x.Base > xx.Base {
		return -1
	}

	return 0
}

func (x *Source) Equal(xx *Source) bool {
	la, lb := len(x.Path), len(xx.Path)
	if la != lb {
		return false
	}

	for idx := 0; idx < la; idx++ {
		if x.Path[idx] != xx.Path[idx] {
			return false
		}
	}

	return true
}

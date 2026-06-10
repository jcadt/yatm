package executor

import (
	"encoding/json"
	"fmt"
	"sync"
)

// JobEvent represents a job state change notification
type JobEvent struct {
	ID     int64  `json:"id"`
	Status int32  `json:"status"`
	Action string `json:"action,omitempty"` // "created", "updated", "deleted"
}

// JobEventBus provides pub/sub for job state changes
type JobEventBus struct {
	mu          sync.RWMutex
	subscribers map[string]chan JobEvent
	nextID      int
}

// NewJobEventBus creates a new event bus
func NewJobEventBus() *JobEventBus {
	return &JobEventBus{
		subscribers: make(map[string]chan JobEvent),
	}
}

// Subscribe creates a new subscription and returns the channel + unsubscribe func
func (b *JobEventBus) Subscribe() (id string, ch <-chan JobEvent, unsubscribe func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.nextID++
	id = fmt.Sprintf("s%d", b.nextID)
	c := make(chan JobEvent, 64)
	b.subscribers[id] = c

	return id, c, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if ch, ok := b.subscribers[id]; ok {
			close(ch)
			delete(b.subscribers, id)
		}
	}
}

// Publish sends an event to all subscribers (non-blocking, drops if full)
func (b *JobEventBus) Publish(event JobEvent) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, ch := range b.subscribers {
		select {
		case ch <- event:
		default:
			// drop if subscriber is too slow
		}
	}
}

// MarshalJSON returns the event as JSON bytes
func (e JobEvent) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]interface{}{
		"id":     e.ID,
		"status": e.Status,
		"action": e.Action,
	})
}

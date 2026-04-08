package models

import (
	"context"
	"time"
)

type Label struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	StudioID  int       `json:"studio_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Rating expressed in 1-100 scale
	Rating        *int   `json:"rating"`
	Favorite      bool   `json:"favorite"`
	Details       string `json:"details"`
	IgnoreAutoTag bool   `json:"ignore_auto_tag"`

	Aliases  RelatedStrings  `json:"aliases"`
	URLs     RelatedStrings  `json:"urls"`
	TagIDs   RelatedIDs      `json:"tag_ids"`
	StashIDs RelatedStashIDs `json:"stash_ids"`
}

func NewLabel() Label {
	currentTime := time.Now()
	return Label{
		CreatedAt: currentTime,
		UpdatedAt: currentTime,
	}
}

// LabelPartial represents part of a Label object. It is used to update the database entry.
type LabelPartial struct {
	ID       int
	Name     OptionalString
	StudioID OptionalInt
	// Rating expressed in 1-100 scale
	Rating        OptionalInt
	Favorite      OptionalBool
	Details       OptionalString
	CreatedAt     OptionalTime
	UpdatedAt     OptionalTime
	IgnoreAutoTag OptionalBool

	Aliases       *UpdateStrings
	URLs          *UpdateStrings
	TagIDs        *UpdateIDs
	StashIDs      *UpdateStashIDs
}

func NewLabelPartial() LabelPartial {
	currentTime := time.Now()
	return LabelPartial{
		UpdatedAt: NewOptionalTime(currentTime),
	}
}

func (s *Label) LoadAliases(ctx context.Context, l AliasLoader) error {
	return s.Aliases.load(func() ([]string, error) {
		return l.GetAliases(ctx, s.ID)
	})
}

func (s *Label) LoadURLs(ctx context.Context, l URLLoader) error {
	return s.URLs.load(func() ([]string, error) {
		return l.GetURLs(ctx, s.ID)
	})
}

func (s *Label) LoadTagIDs(ctx context.Context, l TagIDLoader) error {
	return s.TagIDs.load(func() ([]int, error) {
		return l.GetTagIDs(ctx, s.ID)
	})
}

func (s *Label) LoadStashIDs(ctx context.Context, l StashIDLoader) error {
	return s.StashIDs.load(func() ([]StashID, error) {
		return l.GetStashIDs(ctx, s.ID)
	})
}

func (s *Label) LoadRelationships(ctx context.Context, l LabelReader) error {
	if err := s.LoadAliases(ctx, l); err != nil {
		return err
	}

	if err := s.LoadTagIDs(ctx, l); err != nil {
		return err
	}

	if err := s.LoadStashIDs(ctx, l); err != nil {
		return err
	}

	return nil
}

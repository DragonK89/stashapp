package models

import "context"

// LabelGetter provides methods to get labels by ID.
type LabelGetter interface {
	// TODO - rename this to Find and remove existing method
	FindMany(ctx context.Context, ids []int) ([]*Label, error)
	Find(ctx context.Context, id int) (*Label, error)
}

// LabelFinder provides methods to find labels.
type LabelFinder interface {
	LabelGetter
	FindByStudioID(ctx context.Context, studioID int) ([]*Label, error)
	FindBySceneID(ctx context.Context, sceneID int) (*Label, error)
	FindByName(ctx context.Context, name string, nocase bool) (*Label, error)
}

// LabelQueryer provides methods to query labels.
type LabelQueryer interface {
	Query(ctx context.Context, labelFilter *LabelFilterType, findFilter *FindFilterType) ([]*Label, int, error)
	QueryCount(ctx context.Context, labelFilter *LabelFilterType, findFilter *FindFilterType) (int, error)
}

type LabelAutoTagQueryer interface {
	LabelQueryer
	AliasLoader

	// TODO - this interface is temporary until the filter schema can fully
	// support the query needed
	QueryForAutoTag(ctx context.Context, words []string) ([]*Label, error)
}

// LabelCounter provides methods to count labels.
type LabelCounter interface {
	Count(ctx context.Context) (int, error)
	CountByTagID(ctx context.Context, tagID int) (int, error)
	CountByStudioID(ctx context.Context, studioID int) (int, error)
}

// LabelCreator provides methods to create labels.
type LabelCreator interface {
	Create(ctx context.Context, newLabel *Label) error
}

// LabelUpdater provides methods to update labels.
type LabelUpdater interface {
	Update(ctx context.Context, updatedLabel *Label) error
	UpdatePartial(ctx context.Context, updatedLabel LabelPartial) (*Label, error)
	UpdateImage(ctx context.Context, labelID int, image []byte) error
}

// LabelDestroyer provides methods to destroy labels.
type LabelDestroyer interface {
	Destroy(ctx context.Context, id int) error
}

type LabelFinderCreator interface {
	LabelFinder
	LabelCreator
}

type LabelCreatorUpdater interface {
	LabelCreator
	LabelUpdater
}

// LabelReader provides all methods to read labels.
type LabelReader interface {
	LabelFinder
	LabelQueryer
	LabelAutoTagQueryer
	LabelCounter

	AliasLoader
	TagIDLoader
	URLLoader
	StashIDLoader

	All(ctx context.Context) ([]*Label, error)
	GetImage(ctx context.Context, labelID int) ([]byte, error)
	HasImage(ctx context.Context, labelID int) (bool, error)
}

// LabelWriter provides all methods to modify labels.
type LabelWriter interface {
	LabelCreator
	LabelUpdater
	LabelDestroyer
}

// LabelReaderWriter provides all label methods.
type LabelReaderWriter interface {
	LabelReader
	LabelWriter
}

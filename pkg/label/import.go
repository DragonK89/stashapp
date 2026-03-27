package label

import (
	"context"
	"fmt"

	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/models/jsonschema"
	"github.com/stashapp/stash/pkg/utils"
)

type ImporterReaderWriter interface {
	models.LabelCreatorUpdater
	FindByName(ctx context.Context, name string, nocase bool) (*models.Label, error)
	FindStudioByName(ctx context.Context, name string) (*models.Studio, error)
	FindTagByName(ctx context.Context, name string, nocase bool) (*models.Tag, error)
	CreateStudio(ctx context.Context, studio *models.Studio) error
	CreateTag(ctx context.Context, tag *models.Tag) error
	UpdateImage(ctx context.Context, labelID int, image []byte) error
}

type StudioNotExistError struct {
	missingStudio string
}

func (e StudioNotExistError) Error() string {
	return fmt.Sprintf("studio <%s> does not exist", e.missingStudio)
}

type TagNotExistError struct {
	missingTag string
}

func (e TagNotExistError) Error() string {
	return fmt.Sprintf("tag <%s> does not exist", e.missingTag)
}

type Importer struct {
	ReaderWriter        ImporterReaderWriter
	Input               jsonschema.Label
	MissingRefBehaviour models.ImportMissingRefEnum

	label     models.Label
	imageData []byte
}

func (i *Importer) PreImport(ctx context.Context) error {
	i.label = models.Label{
		Name:          i.Input.Name,
		Rating:        &i.Input.Rating,
		Favorite:      i.Input.Favorite,
		Details:       i.Input.Details,
		IgnoreAutoTag: i.Input.IgnoreAutoTag,
		URLs:          models.NewRelatedStrings(i.Input.URLs),
		CreatedAt:     i.Input.CreatedAt.GetTime(),
		UpdatedAt:     i.Input.UpdatedAt.GetTime(),
	}

	if i.Input.Rating == 0 {
		i.label.Rating = nil
	}

	var err error
	if len(i.Input.Image) > 0 {
		i.imageData, err = utils.ProcessBase64Image(i.Input.Image)
		if err != nil {
			return fmt.Errorf("invalid image: %v", err)
		}
	}

	studioID, err := i.getStudioID(ctx)
	if err != nil {
		return err
	}
	i.label.StudioID = studioID

	return nil
}

func (i *Importer) PostImport(ctx context.Context, id int) error {
	if len(i.imageData) > 0 {
		if err := i.ReaderWriter.UpdateImage(ctx, id, i.imageData); err != nil {
			return fmt.Errorf("error setting label image: %v", err)
		}
	}

	tagIDs, err := i.getTagIDs(ctx)
	if err != nil {
		return err
	}

	partial := models.LabelPartial{
		ID:       id,
		StudioID: models.NewOptionalInt(i.label.StudioID),
		TagIDs: &models.UpdateIDs{
			IDs:  tagIDs,
			Mode: models.RelationshipUpdateModeSet,
		},
		Aliases: &models.UpdateStrings{
			Values: i.Input.Aliases,
			Mode:   models.RelationshipUpdateModeSet,
		},
	}

	if _, err := i.ReaderWriter.UpdatePartial(ctx, partial); err != nil {
		return fmt.Errorf("error updating label relationships: %v", err)
	}

	return nil
}

func (i *Importer) Name() string {
	return i.Input.Name
}

func (i *Importer) FindExistingID(ctx context.Context) (*int, error) {
	existing, err := i.ReaderWriter.FindByName(ctx, i.Name(), false)
	if err != nil {
		return nil, err
	}

	if existing != nil {
		id := existing.ID
		return &id, nil
	}

	return nil, nil
}

func (i *Importer) Create(ctx context.Context) (*int, error) {
	err := i.ReaderWriter.Create(ctx, &i.label)
	if err != nil {
		return nil, fmt.Errorf("error creating label: %v", err)
	}

	id := i.label.ID
	return &id, nil
}

func (i *Importer) Update(ctx context.Context, id int) error {
	label := i.label
	label.ID = id
	// We use UpdatePartial for the main update because the base labels repository
	// likely only has Create and UpdatePartial.
	partial := models.LabelPartial{
		ID:            id,
		Name:          models.NewOptionalString(label.Name),
		Rating:        models.NewOptionalIntPtr(label.Rating),
		Favorite:      models.NewOptionalBool(label.Favorite),
		Details:       models.NewOptionalString(label.Details),
		IgnoreAutoTag: models.NewOptionalBool(label.IgnoreAutoTag),
		URLs: &models.UpdateStrings{
			Values: label.URLs.List(),
			Mode:   models.RelationshipUpdateModeSet,
		},
		CreatedAt: models.NewOptionalTime(label.CreatedAt),
		UpdatedAt: models.NewOptionalTime(label.UpdatedAt),
	}

	_, err := i.ReaderWriter.UpdatePartial(ctx, partial)
	if err != nil {
		return fmt.Errorf("error updating existing label: %v", err)
	}

	return nil
}

func (i *Importer) getStudioID(ctx context.Context) (int, error) {
	if i.Input.Studio == "" {
		return 0, nil
	}

	studio, err := i.ReaderWriter.FindStudioByName(ctx, i.Input.Studio)
	if err != nil {
		return 0, fmt.Errorf("error finding studio by name: %v", err)
	}

	if studio == nil {
		if i.MissingRefBehaviour == models.ImportMissingRefEnumFail {
			return 0, StudioNotExistError{missingStudio: i.Input.Studio}
		}

		if i.MissingRefBehaviour == models.ImportMissingRefEnumIgnore {
			return 0, nil
		}

		if i.MissingRefBehaviour == models.ImportMissingRefEnumCreate {
			newStudio := models.NewStudio()
			newStudio.Name = i.Input.Studio

			err := i.ReaderWriter.CreateStudio(ctx, &newStudio)
			if err != nil {
				return 0, err
			}
			return newStudio.ID, nil
		}
	} else {
		return studio.ID, nil
	}

	return 0, nil
}

func (i *Importer) getTagIDs(ctx context.Context) ([]int, error) {
	var tagIDs []int
	for _, tagName := range i.Input.Tags {
		tag, err := i.ReaderWriter.FindTagByName(ctx, tagName, false)
		if err != nil {
			return nil, fmt.Errorf("error finding tag by name: %v", err)
		}

		if tag == nil {
			if i.MissingRefBehaviour == models.ImportMissingRefEnumFail {
				return nil, TagNotExistError{missingTag: tagName}
			}

			if i.MissingRefBehaviour == models.ImportMissingRefEnumIgnore {
				continue
			}

			if i.MissingRefBehaviour == models.ImportMissingRefEnumCreate {
				newTag := models.NewTag()
				newTag.Name = tagName

				err := i.ReaderWriter.CreateTag(ctx, &newTag)
				if err != nil {
					return nil, err
				}
				tagIDs = append(tagIDs, newTag.ID)
			}
		} else {
			tagIDs = append(tagIDs, tag.ID)
		}
	}

	return tagIDs, nil
}

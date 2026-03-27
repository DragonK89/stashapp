package label

import (
	"context"
	"fmt"

	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/models/json"
	"github.com/stashapp/stash/pkg/models/jsonschema"
	"github.com/stashapp/stash/pkg/utils"
)

type FinderImageGetter interface {
	models.LabelGetter
	models.AliasLoader
	models.URLLoader
	GetImage(ctx context.Context, labelID int) ([]byte, error)
}

// ToJSON converts a Label object into its JSON equivalent.
func ToJSON(ctx context.Context, reader FinderImageGetter, studioReader models.StudioGetter, label *models.Label) (*jsonschema.Label, error) {
	newLabelJSON := jsonschema.Label{
		Name:          label.Name,
		Details:       label.Details,
		Favorite:      label.Favorite,
		IgnoreAutoTag: label.IgnoreAutoTag,
		CreatedAt:     json.JSONTime{Time: label.CreatedAt},
		UpdatedAt:     json.JSONTime{Time: label.UpdatedAt},
	}

	studio, err := studioReader.Find(ctx, label.StudioID)
	if err != nil {
		return nil, fmt.Errorf("error getting studio: %v", err)
	}
	if studio != nil {
		newLabelJSON.Studio = studio.Name
	}

	if label.Rating != nil {
		newLabelJSON.Rating = *label.Rating
	}

	if err := label.LoadAliases(ctx, reader); err != nil {
		return nil, fmt.Errorf("loading label aliases: %w", err)
	}
	newLabelJSON.Aliases = label.Aliases.List()

	if err := label.LoadURLs(ctx, reader); err != nil {
		return nil, fmt.Errorf("loading label URLs: %w", err)
	}
	newLabelJSON.URLs = label.URLs.List()

	image, err := reader.GetImage(ctx, label.ID)
	if err != nil {
		logger.Errorf("Error getting label image: %v", err)
	}

	if len(image) > 0 {
		newLabelJSON.Image = utils.GetBase64StringFromData(image)
	}

	return &newLabelJSON, nil
}

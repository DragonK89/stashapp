package api

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/plugin/hook"
	"github.com/stashapp/stash/pkg/sliceutil/stringslice"
	"github.com/stashapp/stash/pkg/utils"
)

// used to refetch label after hooks run
func (r *mutationResolver) getLabel(ctx context.Context, id int) (ret *models.Label, err error) {
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		ret, err = r.repository.Label.Find(ctx, id)
		return err
	}); err != nil {
		return nil, err
	}

	return ret, nil
}

func (r *mutationResolver) LabelCreate(ctx context.Context, input models.LabelCreateInput) (*models.Label, error) {
	translator := changesetTranslator{
		inputMap: getUpdateInputMap(ctx),
	}

	// Populate a new label from the input
	newLabel := models.NewLabel()

	newLabel.Name = strings.TrimSpace(input.Name)
	newLabel.Rating = input.Rating100
	newLabel.Favorite = translator.bool(input.Favorite)
	newLabel.Details = translator.string(input.Details)
	newLabel.IgnoreAutoTag = translator.bool(input.IgnoreAutoTag)
	newLabel.Aliases = models.NewRelatedStrings(stringslice.TrimSpace(input.Aliases))

	var err error

	newLabel.URLs = models.NewRelatedStrings([]string{})
	if input.Urls != nil {
		newLabel.URLs.Add(stringslice.TrimSpace(input.Urls)...)
	}

	studioID, err := strconv.Atoi(input.StudioID)
	if err != nil {
		return nil, fmt.Errorf("converting studio id: %w", err)
	}
	newLabel.StudioID = studioID

	newLabel.TagIDs, err = translator.relatedIds(input.TagIds)
	if err != nil {
		return nil, fmt.Errorf("converting tag ids: %w", err)
	}

	// Process the base 64 encoded image string
	var imageData []byte
	if input.Image != nil {
		var err error
		imageData, err = utils.ProcessImageInput(ctx, *input.Image)
		if err != nil {
			return nil, fmt.Errorf("processing image: %w", err)
		}
	}

	// Start the transaction and save the label
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Label

		err = qb.Create(ctx, &newLabel)
		if err != nil {
			return err
		}

		if len(imageData) > 0 {
			if err := qb.UpdateImage(ctx, newLabel.ID, imageData); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return nil, err
	}

	r.hookExecutor.ExecutePostHooks(ctx, newLabel.ID, hook.LabelCreatePost, input, nil)
	return r.getLabel(ctx, newLabel.ID)
}

func (r *mutationResolver) LabelUpdate(ctx context.Context, input models.LabelUpdateInput) (*models.Label, error) {
	translator := changesetTranslator{
		inputMap: getUpdateInputMap(ctx),
	}

	// Populate label from the input
	labelID, err := strconv.Atoi(input.ID)
	if err != nil {
		return nil, fmt.Errorf("converting id: %w", err)
	}

	updatedLabel := models.NewLabelPartial()
	updatedLabel.ID = labelID

	updatedLabel.Name = translator.optionalString(input.Name, "name")
	updatedLabel.Rating = translator.optionalInt(input.Rating100, "rating100")
	updatedLabel.Favorite = translator.optionalBool(input.Favorite, "favorite")
	updatedLabel.Details = translator.optionalString(input.Details, "details")
	updatedLabel.IgnoreAutoTag = translator.optionalBool(input.IgnoreAutoTag, "ignore_auto_tag")

	updatedLabel.StudioID, err = translator.optionalIntFromString(input.StudioID, "studio_id")
	if err != nil {
		return nil, fmt.Errorf("converting studio id: %w", err)
	}

	updatedLabel.Aliases = translator.updateStrings(input.Aliases, "aliases")
	updatedLabel.URLs = translator.updateStrings(input.Urls, "urls")

	updatedLabel.TagIDs, err = translator.updateIds(input.TagIds, "tag_ids")
	if err != nil {
		return nil, fmt.Errorf("converting tag ids: %w", err)
	}

	// Process the base 64 encoded image string
	var imageData []byte
	imageIncluded := translator.hasField("image")
	if input.Image != nil {
		var err error
		imageData, err = utils.ProcessImageInput(ctx, *input.Image)
		if err != nil {
			return nil, fmt.Errorf("processing image: %w", err)
		}
	}

	// Start the transaction and save the label
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Label

		_, err := qb.UpdatePartial(ctx, updatedLabel)
		if err != nil {
			return err
		}

		// update image table
		if imageIncluded {
			if err := qb.UpdateImage(ctx, labelID, imageData); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return nil, err
	}

	r.hookExecutor.ExecutePostHooks(ctx, labelID, hook.LabelUpdatePost, input, translator.getFields())
	return r.getLabel(ctx, labelID)
}

func (r *mutationResolver) LabelDestroy(ctx context.Context, input LabelDestroyInput) (bool, error) {
	id, err := strconv.Atoi(input.ID)
	if err != nil {
		return false, fmt.Errorf("converting id: %w", err)
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		return r.repository.Label.Destroy(ctx, id)
	}); err != nil {
		return false, err
	}

	r.hookExecutor.ExecutePostHooks(ctx, id, hook.LabelDestroyPost, input, nil)

	return true, nil
}

func (r *mutationResolver) LabelsDestroy(ctx context.Context, labelIDs []string) (bool, error) {
	ids, err := stringslice.StringSliceToIntSlice(labelIDs)
	if err != nil {
		return false, fmt.Errorf("converting ids: %w", err)
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Label
		for _, id := range ids {
			if err := qb.Destroy(ctx, id); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return false, err
	}

	for _, id := range ids {
		r.hookExecutor.ExecutePostHooks(ctx, id, hook.LabelDestroyPost, labelIDs, nil)
	}

	return true, nil
}

func (r *mutationResolver) BulkLabelUpdate(ctx context.Context, input BulkLabelUpdateInput) ([]*models.Label, error) {
	translator := changesetTranslator{
		inputMap: getUpdateInputMap(ctx),
	}

	labelIDs, err := stringslice.StringSliceToIntSlice(input.Ids)
	if err != nil {
		return nil, fmt.Errorf("converting ids: %w", err)
	}

	updatedLabel := models.NewLabelPartial()

	updatedLabel.Rating = translator.optionalInt(input.Rating100, "rating100")
	updatedLabel.Favorite = translator.optionalBool(input.Favorite, "favorite")
	updatedLabel.Details = translator.optionalString(input.Details, "details")
	updatedLabel.IgnoreAutoTag = translator.optionalBool(input.IgnoreAutoTag, "ignore_auto_tag")

	updatedLabel.StudioID, err = translator.optionalIntFromString(input.StudioID, "studio_id")
	if err != nil {
		return nil, fmt.Errorf("converting studio id: %w", err)
	}

	updatedLabel.URLs = translator.updateStringsBulk(input.Urls, "urls")

	updatedLabel.TagIDs, err = translator.updateIdsBulk(input.TagIds, "tag_ids")
	if err != nil {
		return nil, fmt.Errorf("converting tag ids: %w", err)
	}

	ret := []*models.Label{}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Label

		for _, labelID := range labelIDs {
			updatedLabel.ID = labelID

			label, err := qb.UpdatePartial(ctx, updatedLabel)
			if err != nil {
				return err
			}

			ret = append(ret, label)
		}

		return nil
	}); err != nil {
		return nil, err
	}

	var newRet []*models.Label
	for _, label := range ret {
		r.hookExecutor.ExecutePostHooks(ctx, label.ID, hook.LabelUpdatePost, input, translator.getFields())

		label, err = r.getLabel(ctx, label.ID)
		if err != nil {
			return nil, err
		}

		newRet = append(newRet, label)
	}

	return newRet, nil
}

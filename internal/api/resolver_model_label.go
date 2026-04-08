package api

import (
	"context"

	"github.com/stashapp/stash/internal/api/loaders"
	"github.com/stashapp/stash/internal/api/urlbuilders"
	"github.com/stashapp/stash/pkg/models"
)

func (r *labelResolver) Studio(ctx context.Context, obj *models.Label) (ret *models.Studio, err error) {
	if obj.StudioID == 0 {
		return nil, nil
	}
	return loaders.From(ctx).StudioByID.Load(obj.StudioID)
}

func (r *labelResolver) URL(ctx context.Context, obj *models.Label) (*string, error) {
	if !obj.URLs.Loaded() {
		if err := r.withReadTxn(ctx, func(ctx context.Context) error {
			return obj.LoadURLs(ctx, r.repository.Label)
		}); err != nil {
			return nil, err
		}
	}

	urls := obj.URLs.List()
	if len(urls) == 0 {
		return nil, nil
	}
	return &urls[0], nil
}

func (r *labelResolver) OCounter(ctx context.Context, obj *models.Label) (*int, error) {
	// Labels don't have their own o_counter; return nil
	return nil, nil
}

func (r *labelResolver) ImagePath(ctx context.Context, obj *models.Label) (*string, error) {
	var hasImage bool
	if err := r.withReadTxn(ctx, func(ctx context.Context) error {
		var err error
		hasImage, err = r.repository.Label.HasImage(ctx, obj.ID)
		return err
	}); err != nil {
		return nil, err
	}

	baseURL, _ := ctx.Value(BaseURLCtxKey).(string)
	imagePath := urlbuilders.NewLabelURLBuilder(baseURL, obj).GetLabelImageURL(hasImage)
	return &imagePath, nil
}

func (r *labelResolver) Aliases(ctx context.Context, obj *models.Label) ([]string, error) {
	if !obj.Aliases.Loaded() {
		if err := r.withReadTxn(ctx, func(ctx context.Context) error {
			return obj.LoadAliases(ctx, r.repository.Label)
		}); err != nil {
			return nil, err
		}
	}

	return obj.Aliases.List(), nil
}

func (r *labelResolver) Urls(ctx context.Context, obj *models.Label) ([]string, error) {
	if !obj.URLs.Loaded() {
		if err := r.withReadTxn(ctx, func(ctx context.Context) error {
			return obj.LoadURLs(ctx, r.repository.Label)
		}); err != nil {
			return nil, err
		}
	}

	return obj.URLs.List(), nil
}

func (r *labelResolver) Tags(ctx context.Context, obj *models.Label) (ret []*models.Tag, err error) {
	if !obj.TagIDs.Loaded() {
		if err := r.withReadTxn(ctx, func(ctx context.Context) error {
			return obj.LoadTagIDs(ctx, r.repository.Label)
		}); err != nil {
			return nil, err
		}
	}

	var errs []error
	ret, errs = loaders.From(ctx).TagByID.LoadAll(obj.TagIDs.List())
	return ret, firstError(errs)
}

func (r *labelResolver) SceneCount(ctx context.Context, obj *models.Label) (ret int, err error) {
	if err := r.withReadTxn(ctx, func(ctx context.Context) error {
		ret, err = r.repository.Scene.CountByLabelID(ctx, obj.ID)
		return err
	}); err != nil {
		return 0, err
	}

	return ret, nil
}

func (r *labelResolver) Rating100(ctx context.Context, obj *models.Label) (*int, error) {
	return obj.Rating, nil
}

func (r *labelResolver) StashIds(ctx context.Context, obj *models.Label) ([]*models.StashID, error) {
	if !obj.StashIDs.Loaded() {
		if err := r.withReadTxn(ctx, func(ctx context.Context) error {
			return obj.LoadStashIDs(ctx, r.repository.Label)
		}); err != nil {
			return nil, err
		}
	}

	list := obj.StashIDs.List()
	ret := make([]*models.StashID, len(list))
	for i := range list {
		ret[i] = &list[i]
	}

	return ret, nil
}

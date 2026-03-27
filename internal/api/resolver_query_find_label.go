package api

import (
	"context"
	"strconv"

	"github.com/stashapp/stash/pkg/models"
)

func (r *queryResolver) FindLabel(ctx context.Context, id string) (ret *models.Label, err error) {
	idInt, err := strconv.Atoi(id)
	if err != nil {
		return nil, err
	}

	if err := r.withReadTxn(ctx, func(ctx context.Context) error {
		var err error
		ret, err = r.repository.Label.Find(ctx, idInt)
		return err
	}); err != nil {
		return nil, err
	}

	return ret, nil
}

func (r *queryResolver) FindLabels(ctx context.Context, labelFilter *models.LabelFilterType, filter *models.FindFilterType, ids []string) (ret *FindLabelsResultType, err error) {
	idInts, err := handleIDList(ids, "ids")
	if err != nil {
		return nil, err
	}

	if err := r.withReadTxn(ctx, func(ctx context.Context) error {
		var labels []*models.Label
		var err error
		var total int

		if len(idInts) > 0 {
			labels, err = r.repository.Label.FindMany(ctx, idInts)
			total = len(labels)
		} else {
			labels, total, err = r.repository.Label.Query(ctx, labelFilter, filter)
		}
		if err != nil {
			return err
		}

		ret = &FindLabelsResultType{
			Count:  total,
			Labels: labels,
		}

		return nil
	}); err != nil {
		return nil, err
	}

	return ret, nil
}

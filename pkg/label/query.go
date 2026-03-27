package label

import (
	"context"
	"strconv"

	"github.com/stashapp/stash/pkg/models"
)

func ByName(ctx context.Context, qb models.LabelQueryer, name string) (*models.Label, error) {
	f := &models.LabelFilterType{
		Name: &models.StringCriterionInput{
			Value:    name,
			Modifier: models.CriterionModifierEquals,
		},
	}

	pp := 1
	ret, count, err := qb.Query(ctx, f, &models.FindFilterType{
		PerPage: &pp,
	})

	if err != nil {
		return nil, err
	}

	if count > 0 {
		return ret[0], nil
	}

	return nil, nil
}

func ByAlias(ctx context.Context, qb models.LabelQueryer, alias string) (*models.Label, error) {
	f := &models.LabelFilterType{
		Aliases: &models.StringCriterionInput{
			Value:    alias,
			Modifier: models.CriterionModifierEquals,
		},
	}

	pp := 1
	ret, count, err := qb.Query(ctx, f, &models.FindFilterType{
		PerPage: &pp,
	})

	if err != nil {
		return nil, err
	}

	if count > 0 {
		return ret[0], nil
	}

	return nil, nil
}

func CountByTagID(ctx context.Context, qb models.LabelQueryer, id int, depth *int) (int, error) {
	filter := &models.LabelFilterType{
		Tags: &models.HierarchicalMultiCriterionInput{
			Value:    []string{strconv.Itoa(id)},
			Modifier: models.CriterionModifierIncludes,
			Depth:    depth,
		},
	}

	return qb.QueryCount(ctx, filter, nil)
}

func CountByStudioID(ctx context.Context, qb models.LabelQueryer, id int, depth *int) (int, error) {
	filter := &models.LabelFilterType{
		Studios: &models.HierarchicalMultiCriterionInput{
			Value:    []string{strconv.Itoa(id)},
			Modifier: models.CriterionModifierIncludes,
			Depth:    depth,
		},
	}

	return qb.QueryCount(ctx, filter, nil)
}

package sqlite

import (
	"context"

	"github.com/stashapp/stash/pkg/models"
)

type labelFilterHandler struct {
	labelFilter *models.LabelFilterType
}

func (qb *labelFilterHandler) validate() error {
	labelFilter := qb.labelFilter
	if labelFilter == nil {
		return nil
	}

	if err := validateFilterCombination(labelFilter.OperatorFilter); err != nil {
		return err
	}

	if subFilter := labelFilter.SubFilter(); subFilter != nil {
		sqb := &labelFilterHandler{labelFilter: subFilter}
		if err := sqb.validate(); err != nil {
			return err
		}
	}

	return nil
}

func (qb *labelFilterHandler) handle(ctx context.Context, f *filterBuilder) {
	labelFilter := qb.labelFilter
	if labelFilter == nil {
		return
	}

	if err := qb.validate(); err != nil {
		f.setError(err)
		return
	}

	sf := labelFilter.SubFilter()
	if sf != nil {
		sub := &labelFilterHandler{sf}
		handleSubFilter(ctx, sub, f, labelFilter.OperatorFilter)
	}

	f.handleCriterion(ctx, qb.criterionHandler())
}

func (qb *labelFilterHandler) criterionHandler() criterionHandler {
	labelFilter := qb.labelFilter
	return compoundHandler{
		stringCriterionHandler(labelFilter.Name, labelTable+".name"),
		stringCriterionHandler(labelFilter.Details, labelTable+".details"),
		qb.urlsCriterionHandler(labelFilter.URL),
		intCriterionHandler(labelFilter.Rating100, labelTable+".rating", nil),
		boolCriterionHandler(labelFilter.Favorite, labelTable+".favorite", nil),
		boolCriterionHandler(labelFilter.IgnoreAutoTag, labelTable+".ignore_auto_tag", nil),

		qb.isMissingCriterionHandler(labelFilter.IsMissing),
		qb.tagCountCriterionHandler(labelFilter.TagCount),
		qb.sceneCountCriterionHandler(labelFilter.SceneCount),
		qb.studioCriterionHandler(labelFilter.Studios),
		qb.aliasCriterionHandler(labelFilter.Aliases),
		qb.tagsCriterionHandler(labelFilter.Tags),
		&timestampCriterionHandler{labelFilter.CreatedAt, labelTable + ".created_at", nil},
		&timestampCriterionHandler{labelFilter.UpdatedAt, labelTable + ".updated_at", nil},

		&relatedFilterHandler{
			relatedIDCol:   "scenes.id",
			relatedRepo:    sceneRepository.repository,
			relatedHandler: &sceneFilterHandler{labelFilter.ScenesFilter},
			joinFn: func(f *filterBuilder) {
				labelRepository.scenes.innerJoin(f, "", "labels.id")
			},
		},
	}
}

func (qb *labelFilterHandler) isMissingCriterionHandler(isMissing *string) criterionHandlerFunc {
	return func(ctx context.Context, f *filterBuilder) {
		if isMissing != nil && *isMissing != "" {
			switch *isMissing {
			case "url":
				labelsURLsTableMgr.join(f, "", "labels.id")
				f.addWhere("label_urls.url IS NULL")
			case "image":
				f.addWhere("labels.image_blob IS NULL")
			default:
				f.addWhere("(labels." + *isMissing + " IS NULL OR TRIM(labels." + *isMissing + ") = '')")
			}
		}
	}
}

func (qb *labelFilterHandler) sceneCountCriterionHandler(sceneCount *models.IntCriterionInput) criterionHandlerFunc {
	return func(ctx context.Context, f *filterBuilder) {
		if sceneCount != nil {
			f.addLeftJoin("scenes", "", "scenes.label_id = labels.id")
			clause, args := getIntCriterionWhereClause("count(distinct scenes.id)", *sceneCount)

			f.addHaving(clause, args...)
		}
	}
}

func (qb *labelFilterHandler) tagCountCriterionHandler(tagCount *models.IntCriterionInput) criterionHandlerFunc {
	h := countCriterionHandlerBuilder{
		primaryTable: labelTable,
		joinTable:    labelsTagsTable,
		primaryFK:    labelIDColumn,
	}

	return h.handler(tagCount)
}

func (qb *labelFilterHandler) studioCriterionHandler(studios *models.HierarchicalMultiCriterionInput) criterionHandlerFunc {
	h := hierarchicalMultiCriterionHandlerBuilder{
		primaryTable: labelTable,
		foreignTable: studioTable,
		foreignFK:    "studio_id",
		parentFK:     "parent_id",
	}
	return h.handler(studios)
}

func (qb *labelFilterHandler) aliasCriterionHandler(alias *models.StringCriterionInput) criterionHandlerFunc {
	h := stringListCriterionHandlerBuilder{
		primaryTable: labelTable,
		primaryFK:    labelIDColumn,
		joinTable:    labelAliasesTable,
		stringColumn: labelAliasColumn,
		addJoinTable: func(f *filterBuilder) {
			labelsAliasesTableMgr.join(f, "", "labels.id")
		},
	}

	return h.handler(alias)
}

func (qb *labelFilterHandler) urlsCriterionHandler(url *models.StringCriterionInput) criterionHandlerFunc {
	h := stringListCriterionHandlerBuilder{
		primaryTable: labelTable,
		primaryFK:    labelIDColumn,
		joinTable:    labelURLsTable,
		stringColumn: labelURLColumn,
		addJoinTable: func(f *filterBuilder) {
			labelsURLsTableMgr.join(f, "", "labels.id")
		},
	}

	return h.handler(url)
}

func (qb *labelFilterHandler) tagsCriterionHandler(tags *models.HierarchicalMultiCriterionInput) criterionHandlerFunc {
	h := joinedHierarchicalMultiCriterionHandlerBuilder{
		primaryTable: labelTable,
		foreignTable: tagTable,
		foreignFK:    "tag_id",

		relationsTable: "tags_relations",
		joinTable:      labelsTagsTable,
		joinAs:         "label_tag",
		primaryFK:      labelIDColumn,
	}

	return h.handler(tags)
}

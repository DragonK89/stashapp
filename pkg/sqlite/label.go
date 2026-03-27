package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"github.com/doug-martin/goqu/v9"
	"github.com/doug-martin/goqu/v9/exp"
	"github.com/jmoiron/sqlx"
	"gopkg.in/guregu/null.v4"
	"gopkg.in/guregu/null.v4/zero"

	"github.com/stashapp/stash/pkg/models"
)

const (
	labelTable    = "labels"
	labelIDColumn = "label_id"

	labelURLsTable = "label_urls"
	labelURLColumn = "url"

	labelAliasesTable    = "label_aliases"
	labelAliasColumn     = "alias"
	labelNameColumn      = "name"
	labelImageBlobColumn = "image_blob"
	labelsTagsTable      = "labels_tags"
)

type labelRow struct {
	ID        int         `db:"id" goqu:"skipinsert"`
	Name      zero.String `db:"name"`
	StudioID  null.Int    `db:"studio_id"`
	CreatedAt Timestamp   `db:"created_at"`
	UpdatedAt Timestamp   `db:"updated_at"`
	// expressed as 1-100
	Rating        null.Int    `db:"rating"`
	Favorite      bool        `db:"favorite"`
	Details       zero.String `db:"details"`
	IgnoreAutoTag bool        `db:"ignore_auto_tag"`

	// not used in resolutions or updates
	ImageBlob zero.String `db:"image_blob"`
}

func (r *labelRow) fromLabel(o models.Label) {
	r.ID = o.ID
	r.Name = zero.StringFrom(o.Name)
	if o.StudioID != 0 {
		r.StudioID = null.IntFrom(int64(o.StudioID))
	} else {
		r.StudioID = null.Int{}
	}
	r.CreatedAt = Timestamp{Timestamp: o.CreatedAt}
	r.UpdatedAt = Timestamp{Timestamp: o.UpdatedAt}
	r.Rating = intFromPtr(o.Rating)
	r.Favorite = o.Favorite
	r.Details = zero.StringFrom(o.Details)
	r.IgnoreAutoTag = o.IgnoreAutoTag
}

func (r *labelRow) resolve() *models.Label {
	ret := &models.Label{
		ID:            r.ID,
		Name:          r.Name.String,
		StudioID:      int(r.StudioID.Int64),
		CreatedAt:     r.CreatedAt.Timestamp,
		UpdatedAt:     r.UpdatedAt.Timestamp,
		Rating:        nullIntPtr(r.Rating),
		Favorite:      r.Favorite,
		Details:       r.Details.String,
		IgnoreAutoTag: r.IgnoreAutoTag,
	}

	return ret
}

type labelRowRecord struct {
	updateRecord
}

func (r *labelRowRecord) fromPartial(o models.LabelPartial) {
	r.setNullString("name", o.Name)
	if o.StudioID.Set && o.StudioID.Value == 0 {
		r.set("studio_id", null.Int{})
	} else {
		r.setNullInt("studio_id", o.StudioID)
	}
	r.setTimestamp("created_at", o.CreatedAt)
	r.setTimestamp("updated_at", o.UpdatedAt)
	r.setNullInt("rating", o.Rating)
	r.setBool("favorite", o.Favorite)
	r.setNullString("details", o.Details)
	r.setBool("ignore_auto_tag", o.IgnoreAutoTag)
}

type labelRepositoryType struct {
	repository

	tags joinRepository

	scenes repository
}

var (
	labelRepository = labelRepositoryType{
		repository: repository{
			tableName: labelTable,
			idColumn:  idColumn,
		},
		scenes: repository{
			tableName: sceneTable,
			idColumn:  labelIDColumn,
		},
		tags: joinRepository{
			repository: repository{
				tableName: labelsTagsTable,
				idColumn:  labelIDColumn,
			},
			fkColumn:     tagIDColumn,
			foreignTable: tagTable,
			orderBy:      tagTableSortSQL,
		},
	}
)

type LabelStore struct {
	blobJoinQueryBuilder
	tagRelationshipStore

	tableMgr *table
}

func NewLabelStore(blobStore *BlobStore) *LabelStore {
	return &LabelStore{
		blobJoinQueryBuilder: blobJoinQueryBuilder{
			blobStore: blobStore,
			joinTable: labelTable,
		},
		tagRelationshipStore: tagRelationshipStore{
			idRelationshipStore: idRelationshipStore{
				joinTable: labelsTagsTableMgr,
			},
		},

		tableMgr: labelTableMgr,
	}
}

func (qb *LabelStore) table() exp.IdentifierExpression {
	return qb.tableMgr.table
}

func (qb *LabelStore) selectDataset() *goqu.SelectDataset {
	return dialect.From(qb.table()).Select(qb.table().All())
}

func (qb *LabelStore) Create(ctx context.Context, newObject *models.Label) error {
	var r labelRow
	r.fromLabel(*newObject)

	id, err := qb.tableMgr.insertID(ctx, r)
	if err != nil {
		return err
	}

	if newObject.Aliases.Loaded() {
		if err := labelsAliasesTableMgr.insertJoins(ctx, id, newObject.Aliases.List()); err != nil {
			return err
		}
	}

	if newObject.URLs.Loaded() {
		const startPos = 0
		if err := labelsURLsTableMgr.insertJoins(ctx, id, startPos, newObject.URLs.List()); err != nil {
			return err
		}
	}

	if err := qb.tagRelationshipStore.createRelationships(ctx, id, newObject.TagIDs); err != nil {
		return err
	}

	updated, err := qb.find(ctx, id)
	if err != nil {
		return fmt.Errorf("finding after create: %w", err)
	}

	*newObject = *updated
	return nil
}

func (qb *LabelStore) UpdatePartial(ctx context.Context, input models.LabelPartial) (*models.Label, error) {
	r := labelRowRecord{
		updateRecord{
			Record: make(exp.Record),
		},
	}

	r.fromPartial(input)

	if len(r.Record) > 0 {
		if err := qb.tableMgr.updateByID(ctx, input.ID, r.Record); err != nil {
			return nil, err
		}
	}

	if input.Aliases != nil {
		if err := labelsAliasesTableMgr.modifyJoins(ctx, input.ID, input.Aliases.Values, input.Aliases.Mode); err != nil {
			return nil, err
		}
	}

	if input.URLs != nil {
		if err := labelsURLsTableMgr.modifyJoins(ctx, input.ID, input.URLs.Values, input.URLs.Mode); err != nil {
			return nil, err
		}
	}

	if err := qb.tagRelationshipStore.modifyRelationships(ctx, input.ID, input.TagIDs); err != nil {
		return nil, err
	}

	return qb.Find(ctx, input.ID)
}

// This is only used by the Import/Export functionality
func (qb *LabelStore) Update(ctx context.Context, updatedObject *models.Label) error {
	var r labelRow
	r.fromLabel(*updatedObject)

	if err := qb.tableMgr.updateByID(ctx, updatedObject.ID, r); err != nil {
		return err
	}

	if updatedObject.Aliases.Loaded() {
		if err := labelsAliasesTableMgr.replaceJoins(ctx, updatedObject.ID, updatedObject.Aliases.List()); err != nil {
			return err
		}
	}

	if updatedObject.URLs.Loaded() {
		if err := labelsURLsTableMgr.replaceJoins(ctx, updatedObject.ID, updatedObject.URLs.List()); err != nil {
			return err
		}
	}

	if err := qb.tagRelationshipStore.replaceRelationships(ctx, updatedObject.ID, updatedObject.TagIDs); err != nil {
		return err
	}

	return nil
}

func (qb *LabelStore) Destroy(ctx context.Context, id int) error {
	// must handle image checksums manually
	if err := qb.destroyImage(ctx, id); err != nil {
		return err
	}

	return labelRepository.destroyExisting(ctx, []int{id})
}

// returns nil, nil if not found
func (qb *LabelStore) Find(ctx context.Context, id int) (*models.Label, error) {
	ret, err := qb.find(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return ret, err
}

func (qb *LabelStore) FindMany(ctx context.Context, ids []int) ([]*models.Label, error) {
	ret := make([]*models.Label, len(ids))

	table := qb.table()
	if err := batchExec(ids, defaultBatchSize, func(batch []int) error {
		q := qb.selectDataset().Prepared(true).Where(table.Col(idColumn).In(batch))
		unsorted, err := qb.getMany(ctx, q)
		if err != nil {
			return err
		}

		for _, s := range unsorted {
			i := slices.Index(ids, s.ID)
			ret[i] = s
		}

		return nil
	}); err != nil {
		return nil, err
	}

	for i := range ret {
		if ret[i] == nil {
			return nil, fmt.Errorf("label with id %d not found", ids[i])
		}
	}

	return ret, nil
}

// returns nil, sql.ErrNoRows if not found
func (qb *LabelStore) find(ctx context.Context, id int) (*models.Label, error) {
	q := qb.selectDataset().Where(qb.tableMgr.byID(id))

	ret, err := qb.get(ctx, q)
	if err != nil {
		return nil, err
	}

	return ret, nil
}

// returns nil, sql.ErrNoRows if not found
func (qb *LabelStore) get(ctx context.Context, q *goqu.SelectDataset) (*models.Label, error) {
	ret, err := qb.getMany(ctx, q)
	if err != nil {
		return nil, err
	}

	if len(ret) == 0 {
		return nil, sql.ErrNoRows
	}

	return ret[0], nil
}

func (qb *LabelStore) getMany(ctx context.Context, q *goqu.SelectDataset) ([]*models.Label, error) {
	const single = false
	var ret []*models.Label
	if err := queryFunc(ctx, q, single, func(r *sqlx.Rows) error {
		var f labelRow
		if err := r.StructScan(&f); err != nil {
			return err
		}

		s := f.resolve()

		ret = append(ret, s)
		return nil
	}); err != nil {
		return nil, err
	}

	return ret, nil
}

func (qb *LabelStore) findBySubquery(ctx context.Context, sq *goqu.SelectDataset) ([]*models.Label, error) {
	table := qb.table()

	q := qb.selectDataset().Where(
		table.Col(idColumn).Eq(
			sq,
		),
	)

	return qb.getMany(ctx, q)
}

func (qb *LabelStore) FindByStudioID(ctx context.Context, studioID int) ([]*models.Label, error) {
	table := qb.table()
	sq := qb.selectDataset().Where(table.Col("studio_id").Eq(studioID))
	ret, err := qb.getMany(ctx, sq)

	if err != nil {
		return nil, err
	}

	return ret, nil
}

func (qb *LabelStore) FindBySceneID(ctx context.Context, sceneID int) (*models.Label, error) {
	table := qb.table()
	scenes := sceneTableMgr.table
	sq := qb.selectDataset().Join(
		scenes, goqu.On(table.Col(idColumn), scenes.Col(labelIDColumn)),
	).Where(
		scenes.Col(idColumn),
	).Limit(1)
	ret, err := qb.get(ctx, sq)

	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	return ret, nil
}

func (qb *LabelStore) FindByName(ctx context.Context, name string, nocase bool) (*models.Label, error) {
	where := "name = ?"
	if nocase {
		where += " COLLATE NOCASE"
	}
	sq := qb.selectDataset().Prepared(true).Where(goqu.L(where, name)).Limit(1)
	ret, err := qb.get(ctx, sq)

	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	return ret, nil
}

func (qb *LabelStore) Count(ctx context.Context) (int, error) {
	q := dialect.Select(goqu.COUNT("*")).From(qb.table())
	return count(ctx, q)
}

func (qb *LabelStore) CountByTagID(ctx context.Context, tagID int) (int, error) {
	q := dialect.Select(goqu.COUNT("*")).From(goqu.T(labelsTagsTable)).Where(
		goqu.T(labelsTagsTable).Col(tagIDColumn).Eq(tagID),
	)
	return count(ctx, q)
}

func (qb *LabelStore) CountByStudioID(ctx context.Context, studioID int) (int, error) {
	q := dialect.Select(goqu.COUNT("*")).From(qb.table()).Where(
		qb.table().Col("studio_id").Eq(studioID),
	)
	return count(ctx, q)
}

func (qb *LabelStore) All(ctx context.Context) ([]*models.Label, error) {
	table := qb.table()
	return qb.getMany(ctx, qb.selectDataset().Order(table.Col(labelNameColumn).Asc()))
}

func (qb *LabelStore) QueryForAutoTag(ctx context.Context, words []string) ([]*models.Label, error) {
	table := qb.table()
	sq := dialect.From(table).Select(table.Col(idColumn)).LeftJoin(
		labelsAliasesJoinTable,
		goqu.On(labelsAliasesJoinTable.Col(labelIDColumn).Eq(table.Col(idColumn))),
	)

	var whereClauses []exp.Expression

	for _, w := range words {
		whereClauses = append(whereClauses, table.Col(labelNameColumn).Like(w+"%"))
		whereClauses = append(whereClauses, labelsAliasesJoinTable.Col("alias").Like(w+"%"))
	}

	sq = sq.Where(
		goqu.Or(whereClauses...),
		table.Col("ignore_auto_tag").Eq(0),
	)

	ret, err := qb.findBySubquery(ctx, sq)

	if err != nil {
		return nil, fmt.Errorf("getting labels for autotag: %w", err)
	}

	return ret, nil
}

func (qb *LabelStore) makeQuery(ctx context.Context, labelFilter *models.LabelFilterType, findFilter *models.FindFilterType) (*queryBuilder, error) {
	if labelFilter == nil {
		labelFilter = &models.LabelFilterType{}
	}
	if findFilter == nil {
		findFilter = &models.FindFilterType{}
	}

	query := labelRepository.newQuery()
	distinctIDs(&query, labelTable)

	if q := findFilter.Q; q != nil && *q != "" {
		query.join(labelAliasesTable, "", "label_aliases.label_id = labels.id")
		searchColumns := []string{"labels.name", "label_aliases.alias"}
		query.parseQueryString(searchColumns, *q)
	}

	filter := filterBuilderFromHandler(ctx, &labelFilterHandler{
		labelFilter: labelFilter,
	})

	if err := query.addFilter(filter); err != nil {
		return nil, err
	}

	var err error
	query.sortAndPagination, err = qb.getLabelSort(findFilter)
	if err != nil {
		return nil, err
	}
	query.sortAndPagination += getPagination(findFilter)

	return &query, nil
}

func (qb *LabelStore) Query(ctx context.Context, labelFilter *models.LabelFilterType, findFilter *models.FindFilterType) ([]*models.Label, int, error) {
	query, err := qb.makeQuery(ctx, labelFilter, findFilter)
	if err != nil {
		return nil, 0, err
	}

	idsResult, countResult, err := query.executeFind(ctx)
	if err != nil {
		return nil, 0, err
	}

	labels, err := qb.FindMany(ctx, idsResult)
	if err != nil {
		return nil, 0, err
	}

	return labels, countResult, nil
}

func (qb *LabelStore) QueryCount(ctx context.Context, labelFilter *models.LabelFilterType, findFilter *models.FindFilterType) (int, error) {
	query, err := qb.makeQuery(ctx, labelFilter, findFilter)
	if err != nil {
		return 0, err
	}

	return query.executeCount(ctx)
}

var labelSortOptions = sortOptions{
	"created_at",
	"id",
	"name",
	"scenes_count",
	"random",
	"rating",
	"tag_count",
	"updated_at",
}

func (qb *LabelStore) getLabelSort(findFilter *models.FindFilterType) (string, error) {
	var sort string
	var direction string
	if findFilter == nil {
		sort = "name"
		direction = "ASC"
	} else {
		sort = findFilter.GetSort("name")
		direction = findFilter.GetDirection()
	}

	if err := labelSortOptions.validateSort(sort); err != nil {
		return "", err
	}

	sortQuery := ""
	switch sort {
	case "tag_count":
		sortQuery += getCountSort(labelTable, labelsTagsTable, labelIDColumn, direction)
	case "scenes_count":
		sortQuery += getCountSort(labelTable, sceneTable, labelIDColumn, direction)
	default:
		sortQuery += getSort(sort, direction, "labels")
	}

	// Whatever the sorting, always use name/id as a final sort
	sortQuery += ", COALESCE(labels.name, labels.id) COLLATE NATURAL_CI ASC"
	return sortQuery, nil
}

func (qb *LabelStore) GetImage(ctx context.Context, labelID int) ([]byte, error) {
	return qb.blobJoinQueryBuilder.GetImage(ctx, labelID, labelImageBlobColumn)
}

func (qb *LabelStore) HasImage(ctx context.Context, labelID int) (bool, error) {
	return qb.blobJoinQueryBuilder.HasImage(ctx, labelID, labelImageBlobColumn)
}

func (qb *LabelStore) UpdateImage(ctx context.Context, labelID int, image []byte) error {
	return qb.blobJoinQueryBuilder.UpdateImage(ctx, labelID, labelImageBlobColumn, image)
}

func (qb *LabelStore) destroyImage(ctx context.Context, labelID int) error {
	return qb.blobJoinQueryBuilder.DestroyImage(ctx, labelID, labelImageBlobColumn)
}

func (qb *LabelStore) GetAliases(ctx context.Context, labelID int) ([]string, error) {
	return labelsAliasesTableMgr.get(ctx, labelID)
}

func (qb *LabelStore) GetURLs(ctx context.Context, labelID int) ([]string, error) {
	return labelsURLsTableMgr.get(ctx, labelID)
}

package models

type LabelFilterType struct {
	OperatorFilter[LabelFilterType]
	Name    *StringCriterionInput `json:"name"`
	Details *StringCriterionInput `json:"details"`
	// Filter to only include labels with this parent studio
	Studios *HierarchicalMultiCriterionInput `json:"studios"`
	// Filter to only include labels missing this property
	IsMissing *string `json:"is_missing"`
	// Filter by rating expressed as 1-100
	Rating100 *IntCriterionInput `json:"rating100"`
	// Filter to only include labels with these tags
	Tags *HierarchicalMultiCriterionInput `json:"tags"`
	// Filter by tag count
	TagCount *IntCriterionInput `json:"tag_count"`
	// Filter by favorite
	Favorite *bool `json:"favorite"`
	// Filter by scene count
	SceneCount *IntCriterionInput `json:"scene_count"`
	// Filter by url
	URL *StringCriterionInput `json:"url"`
	// Filter by label aliases
	Aliases *StringCriterionInput `json:"aliases"`
	// Filter by autotag ignore value
	IgnoreAutoTag *bool `json:"ignore_auto_tag"`
	// Filter by related scenes that meet this criteria
	ScenesFilter *SceneFilterType `json:"scenes_filter"`
	// Filter by created at
	CreatedAt *TimestampCriterionInput `json:"created_at"`
	// Filter by updated at
	UpdatedAt *TimestampCriterionInput `json:"updated_at"`
}

type LabelCreateInput struct {
	Name     string   `json:"name"`
	StudioID string   `json:"studio_id"`
	Urls     []string `json:"urls"`
	// This should be a URL or a base64 encoded data URL
	Image         *string          `json:"image"`
	Rating100     *int             `json:"rating100"`
	Favorite      *bool            `json:"favorite"`
	Details       *string          `json:"details"`
	Aliases       []string         `json:"aliases"`
	TagIds        []string         `json:"tag_ids"`
	IgnoreAutoTag *bool            `json:"ignore_auto_tag"`
	StashIds      []StashIDInput `json:"stash_ids"`
}

type LabelUpdateInput struct {
	ID       string   `json:"id"`
	Name     *string  `json:"name"`
	StudioID *string  `json:"studio_id"`
	Urls     []string `json:"urls"`
	// This should be a URL or a base64 encoded data URL
	Image         *string          `json:"image"`
	Rating100     *int             `json:"rating100"`
	Favorite      *bool            `json:"favorite"`
	Details       *string          `json:"details"`
	Aliases       []string         `json:"aliases"`
	TagIds        []string         `json:"tag_ids"`
	IgnoreAutoTag *bool            `json:"ignore_auto_tag"`
	StashIds      []StashIDInput `json:"stash_ids"`
}

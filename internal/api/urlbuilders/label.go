package urlbuilders

import (
	"strconv"

	"github.com/stashapp/stash/pkg/models"
)

type LabelURLBuilder struct {
	BaseURL   string
	LabelID   string
	UpdatedAt string
}

func NewLabelURLBuilder(baseURL string, label *models.Label) LabelURLBuilder {
	return LabelURLBuilder{
		BaseURL:   baseURL,
		LabelID:   strconv.Itoa(label.ID),
		UpdatedAt: strconv.FormatInt(label.UpdatedAt.Unix(), 10),
	}
}

func (b LabelURLBuilder) GetLabelImageURL(hasImage bool) string {
	url := b.BaseURL + "/label/" + b.LabelID + "/image?t=" + b.UpdatedAt
	if !hasImage {
		url += "&default=true"
	}
	return url
}

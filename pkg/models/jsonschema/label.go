package jsonschema

import (
	"fmt"
	"os"

	jsoniter "github.com/json-iterator/go"
	"github.com/stashapp/stash/pkg/fsutil"
	"github.com/stashapp/stash/pkg/models/json"
)

type Label struct {
	Name          string        `json:"name,omitempty"`
	Studio        string        `json:"studio,omitempty"`
	URLs          []string      `json:"urls,omitempty"`
	Image         string        `json:"image,omitempty"`
	CreatedAt     json.JSONTime `json:"created_at,omitempty"`
	UpdatedAt     json.JSONTime `json:"updated_at,omitempty"`
	Rating        int           `json:"rating,omitempty"`
	Favorite      bool          `json:"favorite,omitempty"`
	Details       string        `json:"details,omitempty"`
	Aliases       []string      `json:"aliases,omitempty"`
	Tags          []string      `json:"tags,omitempty"`
	IgnoreAutoTag bool          `json:"ignore_auto_tag,omitempty"`
}

func (s Label) Filename() string {
	return fsutil.SanitiseBasename(s.Name) + ".json"
}

func LoadLabelFile(filePath string) (*Label, error) {
	var label Label
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var json = jsoniter.ConfigCompatibleWithStandardLibrary
	jsonParser := json.NewDecoder(file)
	err = jsonParser.Decode(&label)
	if err != nil {
		return nil, err
	}
	return &label, nil
}

func SaveLabelFile(filePath string, label *Label) error {
	if label == nil {
		return fmt.Errorf("label must not be nil")
	}
	return marshalToFile(filePath, label)
}

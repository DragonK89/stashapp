package scraper

import (
	"context"
	"fmt"
	"reflect"

	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
)

type mappedResult map[string]interface{}
type mappedResults []mappedResult

func (r mappedResult) apply(dest interface{}) {
	destVal := reflect.ValueOf(dest).Elem()

	for key, value := range r {
		if err := mapFieldValue(destVal, key, value); err != nil {
			logger.Errorf("Error mapping field %s in %T: %v", key, dest, err)
		}
	}
}

func mapFieldValue(destVal reflect.Value, key string, value interface{}) error {
	field := destVal.FieldByName(key)

	if !field.IsValid() {
		return fmt.Errorf("field %s does not exist on %s", key, destVal.Type().Name())
	}

	if !field.CanSet() {
		return fmt.Errorf("field %s cannot be set on %s", key, destVal.Type().Name())
	}

	fieldType := field.Type()

	switch v := value.(type) {
	case string:
		switch {
		case fieldType.Kind() == reflect.String:
			field.SetString(v)
		case fieldType.Kind() == reflect.Ptr && fieldType.Elem().Kind() == reflect.String:
			ptr := reflect.New(fieldType.Elem())
			ptr.Elem().SetString(v)
			field.Set(ptr)
		case fieldType.Kind() == reflect.Slice && fieldType.Elem().Kind() == reflect.String:
			field.Set(reflect.ValueOf([]string{v}))
		default:
			return fmt.Errorf("cannot convert %T to %s", value, fieldType)
		}
	case []string:
		if fieldType.Kind() == reflect.Slice && fieldType.Elem().Kind() == reflect.String {
			field.Set(reflect.ValueOf(v))
		} else {
			return fmt.Errorf("cannot convert %T to %s", value, fieldType)
		}
	default:
		reflectValue := reflect.ValueOf(value)
		reflectValueType := reflectValue.Type()

		switch {
		case reflectValueType.ConvertibleTo(fieldType):
			field.Set(reflectValue.Convert(fieldType))
		case fieldType.Kind() == reflect.Pointer && reflectValueType.ConvertibleTo(fieldType.Elem()):
			ptr := reflect.New(fieldType.Elem())
			ptr.Elem().Set(reflectValue.Convert(fieldType.Elem()))
			field.Set(ptr)
		default:
			return fmt.Errorf("cannot convert %T to %s", value, fieldType)
		}
	}

	return nil
}

func (r mappedResult) string(key string) (string, bool) {
	v, ok := r[key]
	if !ok {
		return "", false
	}

	val, ok := v.(string)
	if !ok {
		logger.Errorf("String field %s is %T in mappedResult", key, r[key])
	}

	return val, true
}

func (r mappedResult) mustString(key string) string {
	v, ok := r[key]
	if !ok {
		logger.Errorf("Missing required string field %s in mappedResult", key)
		return ""
	}

	val, ok := v.(string)
	if !ok {
		logger.Errorf("String field %s is %T in mappedResult", key, r[key])
	}

	return val
}

func (r mappedResult) stringPtr(key string) *string {
	val, ok := r.string(key)
	if !ok {
		return nil
	}
	return &val
}

func (r mappedResult) stringSlice(key string) []string {
	v, ok := r[key]
	if !ok {
		return nil
	}

	// need to try both []string and string
	val, ok := v.([]string)

	if ok {
		return val
	}

	// try single string
	singleVal, ok := v.(string)
	if !ok {
		logger.Errorf("String slice field %s is %T in mappedResult", key, r[key])
		return nil
	}

	return []string{singleVal}
}

func (r mappedResult) IntPtr(key string) *int {
	v, ok := r[key]
	if !ok {
		return nil
	}

	val, ok := v.(int)
	if !ok {
		logger.Errorf("Int field %s is %T in mappedResult", key, r[key])
		return nil
	}

	return &val
}

func (r mappedResults) setSingleValue(index int, key string, value string) mappedResults {
	if index >= len(r) {
		r = append(r, make(mappedResult))
	}

	logger.Debugf(`[%d][%s] = %s`, index, key, value)
	r[index][key] = value
	return r
}

func (r mappedResults) setMultiValue(index int, key string, value []string) mappedResults {
	if index >= len(r) {
		r = append(r, make(mappedResult))
	}

	logger.Debugf(`[%d][%s] = %s`, index, key, value)
	r[index][key] = value
	return r
}

func processRelationships[T any](ctx context.Context, s mappedScraper, relationshipMap mappedConfig, q mappedQuery) []*T {
	var ret []*T

	results := relationshipMap.process(ctx, q, s.Common, nil)

	for _, p := range results {
		var value T
		p.apply(&value)
		ret = append(ret, &value)
	}

	return ret
}

func (r mappedResults) scrapedTags() []*models.ScrapedTag {
	if len(r) == 0 {
		return nil
	}

	ret := make([]*models.ScrapedTag, len(r))
	for i, result := range r {
		ret[i] = result.scrapedTag()
	}

	return ret
}

func (r mappedResult) scrapedTag() *models.ScrapedTag {
	return &models.ScrapedTag{
		Name: r.mustString("Name"),
	}
}

func (r mappedResult) scrapedPerformer() *models.ScrapedPerformer {
	ret := &models.ScrapedPerformer{
		Name:           r.stringPtr("Name"),
		Disambiguation: r.stringPtr("Disambiguation"),
		Gender:         r.stringPtr("Gender"),
		URL:            r.stringPtr("URL"),
		URLs:           r.stringSlice("URLs"),
		Twitter:        r.stringPtr("Twitter"),
		Birthdate:      r.stringPtr("Birthdate"),
		Ethnicity:      r.stringPtr("Ethnicity"),
		Country:        r.stringPtr("Country"),
		EyeColor:       r.stringPtr("EyeColor"),
		Height:         r.stringPtr("Height"),
		Measurements:   r.stringPtr("Measurements"),
		FakeTits:       r.stringPtr("FakeTits"),
		PenisLength:    r.stringPtr("PenisLength"),
		Circumcised:    r.stringPtr("Circumcised"),
		CareerLength:   r.stringPtr("CareerLength"),
		CareerStart:    r.stringPtr("CareerStart"),
		CareerEnd:      r.stringPtr("CareerEnd"),
		Tattoos:        r.stringPtr("Tattoos"),
		Piercings:      r.stringPtr("Piercings"),
		Aliases:        r.stringPtr("Aliases"),
		Image:          r.stringPtr("Image"),
		Images:         r.stringSlice("Images"),
		Details:        r.stringPtr("Details"),
		DeathDate:      r.stringPtr("DeathDate"),
		HairColor:      r.stringPtr("HairColor"),
		Weight:         r.stringPtr("Weight"),
	}
	return ret
}

func (r mappedResults) scrapedPerformers() []*models.ScrapedPerformer {
	if len(r) == 0 {
		return nil
	}

	ret := make([]*models.ScrapedPerformer, len(r))
	for i, result := range r {
		ret[i] = result.scrapedPerformer()
	}

	return ret
}

func (r mappedResult) scrapedScene() *models.ScrapedScene {
	ret := &models.ScrapedScene{
		Title:    r.stringPtr("Title"),
		Code:     r.stringPtr("Code"),
		Details:  r.stringPtr("Details"),
		Director: r.stringPtr("Director"),
		URL:      r.stringPtr("URL"),
		URLs:     r.stringSlice("URLs"),
		Date:     r.stringPtr("Date"),
		Image:    r.stringPtr("Image"),
		Duration: r.IntPtr("Duration"),
	}
	return ret
}

func (r mappedResult) scrapedImage() *models.ScrapedImage {
	ret := &models.ScrapedImage{
		Title:        r.stringPtr("Title"),
		Code:         r.stringPtr("Code"),
		Details:      r.stringPtr("Details"),
		Photographer: r.stringPtr("Photographer"),
		URLs:         r.stringSlice("URLs"),
		Date:         r.stringPtr("Date"),
	}
	return ret
}

func (r mappedResult) scrapedGallery() *models.ScrapedGallery {
	ret := &models.ScrapedGallery{
		Title:        r.stringPtr("Title"),
		Code:         r.stringPtr("Code"),
		Details:      r.stringPtr("Details"),
		Photographer: r.stringPtr("Photographer"),
		URL:          r.stringPtr("URL"),
		URLs:         r.stringSlice("URLs"),
		Date:         r.stringPtr("Date"),
	}
	return ret
}

func (r mappedResult) scrapedStudio() *models.ScrapedStudio {
	ret := &models.ScrapedStudio{
		Name:    r.mustString("Name"),
		URL:     r.stringPtr("URL"),
		URLs:    r.stringSlice("URLs"),
		Image:   r.stringPtr("Image"),
		Details: r.stringPtr("Details"),
		Aliases: r.stringPtr("Aliases"),
	}
	return ret
}

func (r mappedResult) scrapedMovie() *models.ScrapedMovie {
	ret := &models.ScrapedMovie{
		Name:       r.stringPtr("Name"),
		Aliases:    r.stringPtr("Aliases"),
		URLs:       r.stringSlice("URLs"),
		Duration:   r.stringPtr("Duration"),
		Date:       r.stringPtr("Date"),
		Director:   r.stringPtr("Director"),
		Synopsis:   r.stringPtr("Synopsis"),
		FrontImage: r.stringPtr("FrontImage"),
		BackImage:  r.stringPtr("BackImage"),
	}

	return ret
}

func (r mappedResult) scrapedGroup() *models.ScrapedGroup {
	ret := &models.ScrapedGroup{
		Name:       r.stringPtr("Name"),
		Aliases:    r.stringPtr("Aliases"),
		URL:        r.stringPtr("URL"),
		URLs:       r.stringSlice("URLs"),
		Duration:   r.stringPtr("Duration"),
		Date:       r.stringPtr("Date"),
		Director:   r.stringPtr("Director"),
		Synopsis:   r.stringPtr("Synopsis"),
		FrontImage: r.stringPtr("FrontImage"),
		BackImage:  r.stringPtr("BackImage"),
	}

	return ret
}

func (r mappedResults) scrapedMovies() []*models.ScrapedMovie {
	if len(r) == 0 {
		return nil
	}
	ret := make([]*models.ScrapedMovie, len(r))
	for i, result := range r {
		ret[i] = result.scrapedMovie()
	}

	return ret
}

func (r mappedResults) scrapedGroups() []*models.ScrapedGroup {
	if len(r) == 0 {
		return nil
	}
	ret := make([]*models.ScrapedGroup, len(r))
	for i, result := range r {
		ret[i] = result.scrapedGroup()
	}

	return ret
}

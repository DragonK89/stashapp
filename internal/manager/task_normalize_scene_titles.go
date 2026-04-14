package manager

import (
	"context"
	"regexp"
	"strings"

	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
)

type sceneTitleNormalizeTask struct {
	repository models.Repository
	input      SceneTitleNormalizeInput
}

func (t *sceneTitleNormalizeTask) Start(ctx context.Context) (*NormalizeSceneTitlesResult, error) {
	logger.Infof("Starting scene title normalization with pattern: %q", t.input.Pattern)

	result := &NormalizeSceneTitlesResult{}

	scenes, err := t.repository.Scene.All(ctx)
	if err != nil {
		return nil, err
	}

	for _, s := range scenes {
		if s.Code == "" || s.Title == "" {
			result.Skipped++
			continue
		}

		// 1. Remove the code from the title (case-insensitive)
		// We use QuoteMeta to ensure characters like '-' in codes are treated literally
		codeRegex := regexp.MustCompile("(?i)" + regexp.QuoteMeta(s.Code))
		baseTitle := codeRegex.ReplaceAllString(s.Title, " ")

		// 2. Clean up leading/trailing separators and whitespace
		// This regex matches leading/trailing whitespace and common separators
		cleanRegex := regexp.MustCompile(`^[:–—\s-]+|[:–—\s-]+$`)
		cleanedTitle := cleanRegex.ReplaceAllString(baseTitle, "")

		// Handle internal multiple separators/spaces by collapsing them into a single space
		internalCleanRegex := regexp.MustCompile(`[:–—\s-]+`)
		cleanedTitle = internalCleanRegex.ReplaceAllString(cleanedTitle, " ")
		cleanedTitle = strings.TrimSpace(cleanedTitle)

		// 3. Construct the new title
		newTitle := s.Code + t.input.Pattern + cleanedTitle

		if newTitle == s.Title {
			result.Unprocessed++
			continue
		}

		// Update the scene
		updatePartial := models.NewScenePartial()
		updatePartial.Title = models.NewOptionalString(newTitle)

		if _, err := t.repository.Scene.UpdatePartial(ctx, s.ID, updatePartial); err != nil {
			logger.Errorf("Error updating scene %d title: %v", s.ID, err)
			continue
		}

		result.Renamed++
	}

	logger.Infof("Finished scene title normalization. Renamed: %d, Skipped: %d, Unprocessed: %d", result.Renamed, result.Skipped, result.Unprocessed)
	return result, nil
}

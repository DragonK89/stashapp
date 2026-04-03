package manager

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/stashapp/stash/internal/identify"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/scraper"
	"github.com/stashapp/stash/pkg/utils"
)

type ImportTorrentScenesInput struct {
	Path           string                 `json:"path"`
	NormalizeTitle bool                   `json:"normalizeTitle"`
	UseScrapers    bool                   `json:"useScrapers"`
	ScraperID      *string                `json:"scraperID"`
	FieldOptions   []*identify.FieldOptions `json:"fieldOptions"`
}

type ImportTorrentScenesResult struct {
	Created      int    `json:"created"`
	Failed       int    `json:"failed"`
	FailFilePath string `json:"failFilePath"`
}

func (s *Manager) ImportTorrentScenesFromFile(ctx context.Context, input ImportTorrentScenesInput) (ImportTorrentScenesResult, error) {
	if strings.TrimSpace(input.Path) == "" {
		return ImportTorrentScenesResult{}, errors.New("path is required")
	}
	if input.UseScrapers && (input.ScraperID == nil || strings.TrimSpace(*input.ScraperID) == "") {
		return ImportTorrentScenesResult{}, errors.New("scraperID is required when useScrapers is enabled")
	}

	failPath := filepath.Join(
		filepath.Dir(input.Path),
		fmt.Sprintf("fail import %s", filepath.Base(input.Path)),
	)

	f, err := os.Open(input.Path)
	if err != nil {
		return ImportTorrentScenesResult{}, err
	}
	defer f.Close()

	fieldOptions := make(map[string]*identify.FieldOptions)
	for _, fo := range input.FieldOptions {
		if fo == nil {
			continue
		}
		fieldOptions[strings.ToLower(strings.TrimSpace(fo.Field))] = fo
	}

	var created int
	var failedLines []string

	sc := bufio.NewScanner(f)
	// allow long lines
	sc.Buffer(make([]byte, 64*1024), 1024*1024)

	for sc.Scan() {
		rawLine := sc.Text()
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		name, rating100, ok, reason := parseTorrentImportLine(line)
		if !ok {
			failedLines = append(failedLines, rawLine)
			logger.Warnf("Torrent import skipped line: %q (%s)", line, reason)
			continue
		}

		title := name
		if input.NormalizeTitle {
			// parseTorrentTitleStrict expects a path; supply a synthetic basename
			m, ok := parseTorrentTitleStrict(title + ".torrent")
			if !ok {
				failedLines = append(failedLines, rawLine)
				logger.Warnf("Torrent import skipped (normalize failed): %q", line)
				continue
			}
			title = formatTorrentTitle(m.prefix, m.number)
		}

		err := s.Repository.WithTxn(ctx, func(ctx context.Context) error {
			newScene := models.NewScene()
			newScene.Title = title
			if rating100 != nil {
				newScene.Rating = rating100
			}

			var coverImage []byte

			if input.UseScrapers {
				query := title
				content, err := s.ScraperCache.ScrapeName(ctx, *input.ScraperID, query, scraper.ScrapeContentTypeScene)
				if err != nil {
					return fmt.Errorf("scrape error: %w", err)
				}

				scrapedScenes, err := marshalScrapedScenes(content)
				if err != nil {
					return fmt.Errorf("scrape conversion error: %w", err)
				}

				if len(scrapedScenes) != 1 {
					// 0 or multiple
					return errScrapeNoSingleMatch
				}

				scraped := scrapedScenes[0]
				applyScrapedSceneToNewScene(ctx, s.Repository, &newScene, scraped, *input.ScraperID, fieldOptions)

				// cover image is handled separately via SceneService.Create
				if shouldSetField(fieldOptions, "cover_image") && scraped.Image != nil && strings.TrimSpace(*scraped.Image) != "" {
					img, err := utils.ProcessImageInput(ctx, *scraped.Image)
					if err != nil {
						return fmt.Errorf("processing cover image: %w", err)
					}
					coverImage = img
				}
			}

			_, err := s.SceneService.Create(ctx, models.CreateSceneInput{
				Scene:      &newScene,
				CoverImage: coverImage,
			})
			return err
		})

		if err != nil {
			failedLines = append(failedLines, rawLine)
			if errors.Is(err, errScrapeNoSingleMatch) {
				logger.Warnf("Torrent import skipped (scraper 0/multi match): %q", line)
			} else {
				logger.Warnf("Torrent import failed for %q: %v", line, err)
			}
			continue
		}

		created++
	}

	if err := sc.Err(); err != nil {
		return ImportTorrentScenesResult{}, err
	}

	if len(failedLines) > 0 {
		data := strings.Join(failedLines, "\n") + "\n"
		if err := os.WriteFile(failPath, []byte(data), 0o644); err != nil {
			return ImportTorrentScenesResult{}, fmt.Errorf("writing fail import file: %w", err)
		}
	} else {
		// ensure the fail file path is predictable; remove if it exists from a previous run
		_ = os.Remove(failPath)
	}

	return ImportTorrentScenesResult{
		Created:      created,
		Failed:       len(failedLines),
		FailFilePath: failPath,
	}, nil
}

var errScrapeNoSingleMatch = errors.New("scraper did not return exactly one match")

func parseTorrentImportLine(line string) (name string, rating100 *int, ok bool, reason string) {
	parts := strings.Split(line, ";")
	if len(parts) == 0 || len(parts) > 2 {
		return "", nil, false, "invalid format"
	}

	name = strings.TrimSpace(parts[0])
	if name == "" {
		return "", nil, false, "missing name"
	}

	if len(parts) == 1 || strings.TrimSpace(parts[1]) == "" {
		return name, nil, true, ""
	}

	rating10, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil {
		return "", nil, false, "invalid rating"
	}
	if rating10 < 1 || rating10 > 10 {
		return "", nil, false, "rating out of range"
	}

	v := rating10 * 10
	return name, &v, true, ""
}

func shouldSetField(fieldOptions map[string]*identify.FieldOptions, field string) bool {
	fo := fieldOptions[field]
	if fo == nil {
		// default MERGE
		return true
	}
	return fo.Strategy != identify.FieldStrategyIgnore
}

func applyScrapedSceneToNewScene(
	ctx context.Context,
	repo models.Repository,
	target *models.Scene,
	scraped *models.ScrapedScene,
	scraperID string,
	fieldOptions map[string]*identify.FieldOptions,
) {
	if scraped == nil || target == nil {
		return
	}

	if shouldSetField(fieldOptions, "title") && scraped.Title != nil && strings.TrimSpace(*scraped.Title) != "" {
		target.Title = strings.TrimSpace(*scraped.Title)
	}
	if shouldSetField(fieldOptions, "code") && scraped.Code != nil && strings.TrimSpace(*scraped.Code) != "" {
		target.Code = strings.TrimSpace(*scraped.Code)
	}
	if shouldSetField(fieldOptions, "details") && scraped.Details != nil && strings.TrimSpace(*scraped.Details) != "" {
		target.Details = strings.TrimSpace(*scraped.Details)
	}
	if shouldSetField(fieldOptions, "director") && scraped.Director != nil && strings.TrimSpace(*scraped.Director) != "" {
		target.Director = strings.TrimSpace(*scraped.Director)
	}

	if shouldSetField(fieldOptions, "url") {
		urls := scraped.URLs
		if len(urls) == 0 && scraped.URL != nil && strings.TrimSpace(*scraped.URL) != "" {
			urls = []string{strings.TrimSpace(*scraped.URL)}
		}
		if len(urls) > 0 {
			for i := range urls {
				urls[i] = strings.TrimSpace(urls[i])
			}
			target.URLs = models.NewRelatedStrings(urls)
		}
	}

	if shouldSetField(fieldOptions, "date") && scraped.Date != nil && strings.TrimSpace(*scraped.Date) != "" {
		if d, err := models.ParseDate(strings.TrimSpace(*scraped.Date)); err == nil {
			target.Date = &d
		}
	}

	if shouldSetField(fieldOptions, "studio") && scraped.Studio != nil {
		studioID := maybeGetOrCreateStudioID(ctx, repo, scraped.Studio, scraperID, fieldOptions)
		if studioID != nil {
			target.StudioID = studioID
		}
	}

	if shouldSetField(fieldOptions, "performers") && len(scraped.Performers) > 0 {
		ids := make([]int, 0, len(scraped.Performers))
		createMissing := false
		if fo := fieldOptions["performers"]; fo != nil && utils.IsTrue(fo.CreateMissing) {
			createMissing = true
		}
		for _, p := range scraped.Performers {
			if p == nil || p.Name == nil || strings.TrimSpace(*p.Name) == "" {
				continue
			}
			if p.StoredID != nil && strings.TrimSpace(*p.StoredID) != "" {
				if id, err := strconv.Atoi(*p.StoredID); err == nil {
					ids = append(ids, id)
				}
				continue
			}
			if createMissing {
				newP := p.ToPerformer(scraperID, map[string]bool{})
				if err := repo.Performer.Create(ctx, &models.CreatePerformerInput{Performer: newP}); err == nil {
					ids = append(ids, newP.ID)
				}
			}
		}
		if len(ids) > 0 {
			target.PerformerIDs = models.NewRelatedIDs(ids)
		}
	}

	if shouldSetField(fieldOptions, "groups") && len(scraped.Groups) > 0 {
		var groups []models.GroupsScenes
		for _, g := range scraped.Groups {
			if g == nil || g.StoredID == nil || strings.TrimSpace(*g.StoredID) == "" {
				continue
			}
			id, err := strconv.Atoi(*g.StoredID)
			if err != nil {
				continue
			}
			groups = append(groups, models.GroupsScenes{GroupID: id})
		}
		if len(groups) > 0 {
			target.Groups = models.NewRelatedGroups(groups)
		}
	}

	if shouldSetField(fieldOptions, "stash_ids") && scraped.RemoteSiteID != nil && strings.TrimSpace(*scraped.RemoteSiteID) != "" {
		target.StashIDs = models.NewRelatedStashIDs([]models.StashID{
			{
				Endpoint:  scraperID,
				StashID:   strings.TrimSpace(*scraped.RemoteSiteID),
				UpdatedAt: target.UpdatedAt,
			},
		})
	}
}

func maybeGetOrCreateStudioID(
	ctx context.Context,
	repo models.Repository,
	studio *models.ScrapedStudio,
	endpoint string,
	fieldOptions map[string]*identify.FieldOptions,
) *int {
	if studio == nil {
		return nil
	}

	if studio.StoredID != nil && strings.TrimSpace(*studio.StoredID) != "" {
		if id, err := strconv.Atoi(*studio.StoredID); err == nil {
			return &id
		}
		return nil
	}

	fo := fieldOptions["studio"]
	createMissing := fo != nil && utils.IsTrue(fo.CreateMissing)
	if !createMissing {
		return nil
	}

	newStudio := studio.ToStudio(endpoint, map[string]bool{})
	if err := repo.Studio.Create(ctx, newStudio); err != nil {
		return nil
	}
	return &newStudio.ID
}

func marshalScrapedScenes(content []scraper.ScrapedContent) ([]*models.ScrapedScene, error) {
	var ret []*models.ScrapedScene
	for _, c := range content {
		if c == nil {
			continue
		}
		switch s := c.(type) {
		case *models.ScrapedScene:
			ret = append(ret, s)
		case models.ScrapedScene:
			ret = append(ret, &s)
		default:
			return nil, fmt.Errorf("%w: cannot turn ScrapedContent into ScrapedScene", models.ErrConversion)
		}
	}
	return ret, nil
}

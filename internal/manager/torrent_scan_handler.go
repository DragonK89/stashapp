package manager

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/stashapp/stash/pkg/file"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/plugin"
	"github.com/stashapp/stash/pkg/plugin/hook"
)

type torrentSceneScanHandler struct {
	SceneRepo   sceneFinderUpdater
	FileRepo    models.FileFinderUpdater
	FolderRepo  models.FolderReaderWriter
	PluginCache *plugin.Cache

	NormalizeTitle bool
	RenameFile     bool

	recordSkipped func(path string)
}

type sceneFinderUpdater interface {
	FindByFileID(ctx context.Context, fileID models.FileID) ([]*models.Scene, error)
	FindByFingerprints(ctx context.Context, fp []models.Fingerprint) ([]*models.Scene, error)
	GetFiles(ctx context.Context, relatedID int) ([]*models.VideoFile, error)
	Create(ctx context.Context, newScene *models.Scene, fileIDs []models.FileID) error
	UpdatePartial(ctx context.Context, id int, updatedScene models.ScenePartial) (*models.Scene, error)
	AddFileID(ctx context.Context, id int, fileID models.FileID) error
}

func isTorrentPath(p string) bool {
	return strings.EqualFold(filepath.Ext(p), ".torrent")
}

func torrentVideoFileFilter(ctx context.Context, f models.File) bool {
	return isTorrentPath(f.Base().Path)
}

func (h *torrentSceneScanHandler) Handle(ctx context.Context, f models.File, oldFile models.File) error {
	vf, ok := f.(*models.VideoFile)
	if !ok {
		return nil
	}

	path := vf.Base().Path
	if !isTorrentPath(path) {
		return nil
	}

	// Determine desired title.
	base := filepath.Base(path)
	origTitle := strings.TrimSuffix(base, filepath.Ext(base))

	title := origTitle
	normalizedTitle := ""
	if h.NormalizeTitle {
		m, ok := parseTorrentTitleStrict(path)
		if !ok {
			if h.recordSkipped != nil {
				h.recordSkipped(path)
			}
			return nil
		}
		normalizedTitle = formatTorrentTitle(m.prefix, m.number)
		title = normalizedTitle
	}

	// Optionally rename file on disk (and update DB) to match normalized title.
	// If rename is enabled and there is a conflict, skip rename and keep original title.
	if h.NormalizeTitle && h.RenameFile && normalizedTitle != "" {
		parent, err := h.FolderRepo.Find(ctx, vf.Base().ParentFolderID)
		if err != nil {
			return fmt.Errorf("finding parent folder: %w", err)
		}
		if parent == nil {
			return fmt.Errorf("parent folder not found for %s", path)
		}

		targetBasename := normalizedTitle + ".torrent"
		targetPath := filepath.Join(parent.Path, targetBasename)
		if _, err := os.Stat(targetPath); err == nil {
			// conflict: keep original title and don't rename
			title = origTitle
		} else if !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("checking rename target: %w", err)
		} else {
			mover := file.NewMover(h.FileRepo, h.FolderRepo)
			mover.RegisterHooks(ctx)
			if err := mover.Move(ctx, vf, parent, targetBasename); err != nil {
				// if move failed due to existence, treat like conflict
				if strings.Contains(err.Error(), "already exists") {
					title = origTitle
				} else {
					return err
				}
			}
		}
	}

	// Try to match existing scene by file id.
	existing, err := h.SceneRepo.FindByFileID(ctx, vf.Base().ID)
	if err != nil {
		return fmt.Errorf("finding existing scene: %w", err)
	}

	if len(existing) > 0 {
		// Ensure association exists.
		for _, s := range existing {
			if err := s.LoadFiles(ctx, h.SceneRepo); err != nil {
				return err
			}
			found := false
			for _, sf := range s.Files.List() {
				if sf.ID == vf.ID {
					found = true
					break
				}
			}
			if !found {
				if err := h.SceneRepo.AddFileID(ctx, s.ID, vf.ID); err != nil {
					return fmt.Errorf("adding file to scene: %w", err)
				}
				scenePartial := models.NewScenePartial()
				if _, err := h.SceneRepo.UpdatePartial(ctx, s.ID, scenePartial); err != nil {
					return fmt.Errorf("updating scene: %w", err)
				}
			}
		}
		return nil
	}

	newScene := models.NewScene()
	newScene.Title = title
	logger.Infof("%s doesn't exist. Creating new torrent scene...", path)
	if err := h.SceneRepo.Create(ctx, &newScene, []models.FileID{vf.ID}); err != nil {
		return fmt.Errorf("creating new scene: %w", err)
	}
	h.PluginCache.RegisterPostHooks(ctx, newScene.ID, hook.SceneCreatePost, nil, nil)
	return nil
}

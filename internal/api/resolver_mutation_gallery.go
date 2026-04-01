package api

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/stashapp/stash/internal/manager"
	"github.com/stashapp/stash/pkg/file"
	file_image "github.com/stashapp/stash/pkg/file/image"
	"github.com/stashapp/stash/pkg/fsutil"
	"github.com/stashapp/stash/pkg/gallery"
	"github.com/stashapp/stash/pkg/hash/md5"
	"github.com/stashapp/stash/pkg/image"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/plugin"
	"github.com/stashapp/stash/pkg/plugin/hook"
	"github.com/stashapp/stash/pkg/sliceutil/stringslice"
	"github.com/stashapp/stash/pkg/utils"
)

// used to refetch gallery after hooks run
func (r *mutationResolver) getGallery(ctx context.Context, id int) (ret *models.Gallery, err error) {
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		ret, err = r.repository.Gallery.Find(ctx, id)
		return err
	}); err != nil {
		return nil, err
	}

	return ret, nil
}

func (r *mutationResolver) GalleryCreate(ctx context.Context, input GalleryCreateInput) (*models.Gallery, error) {
	// name must be provided
	if input.Title == "" {
		return nil, errors.New("title must not be empty")
	}

	translator := changesetTranslator{
		inputMap: getUpdateInputMap(ctx),
	}

	// Populate a new gallery from the input
	newGallery := models.NewGallery()

	newGallery.Title = strings.TrimSpace(input.Title)
	newGallery.Code = translator.string(input.Code)
	newGallery.Details = translator.string(input.Details)
	newGallery.Photographer = translator.string(input.Photographer)
	newGallery.Rating = input.Rating100
	newGallery.Organized = translator.bool(input.Organized)

	var err error

	newGallery.Date, err = translator.datePtr(input.Date)
	if err != nil {
		return nil, fmt.Errorf("converting date: %w", err)
	}
	newGallery.StudioID, err = translator.intPtrFromString(input.StudioID)
	if err != nil {
		return nil, fmt.Errorf("converting studio id: %w", err)
	}

	newGallery.PerformerIDs, err = translator.relatedIds(input.PerformerIds)
	if err != nil {
		return nil, fmt.Errorf("converting performer ids: %w", err)
	}
	newGallery.TagIDs, err = translator.relatedIds(input.TagIds)
	if err != nil {
		return nil, fmt.Errorf("converting tag ids: %w", err)
	}
	newGallery.SceneIDs, err = translator.relatedIds(input.SceneIds)
	if err != nil {
		return nil, fmt.Errorf("converting scene ids: %w", err)
	}

	if input.Urls != nil {
		newGallery.URLs = models.NewRelatedStrings(stringslice.TrimSpace(input.Urls))
	} else if input.URL != nil {
		newGallery.URLs = models.NewRelatedStrings([]string{strings.TrimSpace(*input.URL)})
	}

	// Start the transaction and save the gallery
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Gallery
		if err := qb.Create(ctx, &newGallery, nil); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return nil, err
	}

	r.hookExecutor.ExecutePostHooks(ctx, newGallery.ID, hook.GalleryCreatePost, input, nil)
	return r.getGallery(ctx, newGallery.ID)
}

func (r *mutationResolver) GalleryUpdate(ctx context.Context, input models.GalleryUpdateInput) (ret *models.Gallery, err error) {
	translator := changesetTranslator{
		inputMap: getUpdateInputMap(ctx),
	}

	// Start the transaction and save the gallery
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		ret, err = r.galleryUpdate(ctx, input, translator)
		return err
	}); err != nil {
		return nil, err
	}

	// execute post hooks outside txn
	r.hookExecutor.ExecutePostHooks(ctx, ret.ID, hook.GalleryUpdatePost, input, translator.getFields())
	return r.getGallery(ctx, ret.ID)
}

func (r *mutationResolver) GalleriesUpdate(ctx context.Context, input []*models.GalleryUpdateInput) (ret []*models.Gallery, err error) {
	inputMaps := getUpdateInputMaps(ctx)

	// Start the transaction and save the galleries
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		for i, gallery := range input {
			translator := changesetTranslator{
				inputMap: inputMaps[i],
			}

			thisGallery, err := r.galleryUpdate(ctx, *gallery, translator)
			if err != nil {
				return err
			}

			ret = append(ret, thisGallery)
		}

		return nil
	}); err != nil {
		return nil, err
	}

	// execute post hooks outside txn
	var newRet []*models.Gallery
	for i, gallery := range ret {
		translator := changesetTranslator{
			inputMap: inputMaps[i],
		}

		r.hookExecutor.ExecutePostHooks(ctx, gallery.ID, hook.GalleryUpdatePost, input, translator.getFields())

		gallery, err = r.getGallery(ctx, gallery.ID)
		if err != nil {
			return nil, err
		}

		newRet = append(newRet, gallery)
	}

	return newRet, nil
}

func (r *mutationResolver) galleryUpdate(ctx context.Context, input models.GalleryUpdateInput, translator changesetTranslator) (*models.Gallery, error) {
	galleryID, err := strconv.Atoi(input.ID)
	if err != nil {
		return nil, fmt.Errorf("converting id: %w", err)
	}

	qb := r.repository.Gallery

	originalGallery, err := qb.Find(ctx, galleryID)
	if err != nil {
		return nil, err
	}

	if originalGallery == nil {
		return nil, fmt.Errorf("gallery with id %d not found", galleryID)
	}

	// Populate gallery from the input
	updatedGallery := models.NewGalleryPartial()

	if input.Title != nil {
		// ensure title is not empty
		if *input.Title == "" && originalGallery.IsUserCreated() {
			return nil, errors.New("title must not be empty for user-created galleries")
		}

		updatedGallery.Title = models.NewOptionalString(*input.Title)
	}

	updatedGallery.Code = translator.optionalString(input.Code, "code")
	updatedGallery.Details = translator.optionalString(input.Details, "details")
	updatedGallery.Photographer = translator.optionalString(input.Photographer, "photographer")
	updatedGallery.Rating = translator.optionalInt(input.Rating100, "rating100")
	updatedGallery.Organized = translator.optionalBool(input.Organized, "organized")

	updatedGallery.Date, err = translator.optionalDate(input.Date, "date")
	if err != nil {
		return nil, fmt.Errorf("converting date: %w", err)
	}
	updatedGallery.StudioID, err = translator.optionalIntFromString(input.StudioID, "studio_id")
	if err != nil {
		return nil, fmt.Errorf("converting studio id: %w", err)
	}

	updatedGallery.URLs = translator.optionalURLs(input.Urls, input.URL)

	updatedGallery.PrimaryFileID, err = translator.fileIDPtrFromString(input.PrimaryFileID)
	if err != nil {
		return nil, fmt.Errorf("converting primary file id: %w", err)
	}
	if updatedGallery.PrimaryFileID != nil {
		primaryFileID := *updatedGallery.PrimaryFileID

		if err := originalGallery.LoadFiles(ctx, r.repository.Gallery); err != nil {
			return nil, err
		}

		// ensure that new primary file is associated with gallery
		var f models.File
		for _, ff := range originalGallery.Files.List() {
			if ff.Base().ID == primaryFileID {
				f = ff
			}
		}

		if f == nil {
			return nil, fmt.Errorf("file with id %d not associated with gallery", primaryFileID)
		}
	}

	updatedGallery.PerformerIDs, err = translator.updateIds(input.PerformerIds, "performer_ids")
	if err != nil {
		return nil, fmt.Errorf("converting performer ids: %w", err)
	}
	updatedGallery.TagIDs, err = translator.updateIds(input.TagIds, "tag_ids")
	if err != nil {
		return nil, fmt.Errorf("converting tag ids: %w", err)
	}
	updatedGallery.SceneIDs, err = translator.updateIds(input.SceneIds, "scene_ids")
	if err != nil {
		return nil, fmt.Errorf("converting scene ids: %w", err)
	}

	// gallery scene is set from the scene only

	gallery, err := qb.UpdatePartial(ctx, galleryID, updatedGallery)
	if err != nil {
		return nil, err
	}

	return gallery, nil
}

func (r *mutationResolver) BulkGalleryUpdate(ctx context.Context, input BulkGalleryUpdateInput) ([]*models.Gallery, error) {
	galleryIDs, err := stringslice.StringSliceToIntSlice(input.Ids)
	if err != nil {
		return nil, fmt.Errorf("converting ids: %w", err)
	}

	translator := changesetTranslator{
		inputMap: getUpdateInputMap(ctx),
	}

	// Populate gallery from the input
	updatedGallery := models.NewGalleryPartial()

	updatedGallery.Code = translator.optionalString(input.Code, "code")
	updatedGallery.Details = translator.optionalString(input.Details, "details")
	updatedGallery.Photographer = translator.optionalString(input.Photographer, "photographer")
	updatedGallery.Rating = translator.optionalInt(input.Rating100, "rating100")
	updatedGallery.Organized = translator.optionalBool(input.Organized, "organized")
	updatedGallery.URLs = translator.optionalURLsBulk(input.Urls, input.URL)

	updatedGallery.Date, err = translator.optionalDate(input.Date, "date")
	if err != nil {
		return nil, fmt.Errorf("converting date: %w", err)
	}
	updatedGallery.StudioID, err = translator.optionalIntFromString(input.StudioID, "studio_id")
	if err != nil {
		return nil, fmt.Errorf("converting studio id: %w", err)
	}

	updatedGallery.PerformerIDs, err = translator.updateIdsBulk(input.PerformerIds, "performer_ids")
	if err != nil {
		return nil, fmt.Errorf("converting performer ids: %w", err)
	}
	updatedGallery.TagIDs, err = translator.updateIdsBulk(input.TagIds, "tag_ids")
	if err != nil {
		return nil, fmt.Errorf("converting tag ids: %w", err)
	}
	updatedGallery.SceneIDs, err = translator.updateIdsBulk(input.SceneIds, "scene_ids")
	if err != nil {
		return nil, fmt.Errorf("converting scene ids: %w", err)
	}

	ret := []*models.Gallery{}

	// Start the transaction and save the galleries
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Gallery

		for _, galleryID := range galleryIDs {
			gallery, err := qb.UpdatePartial(ctx, galleryID, updatedGallery)
			if err != nil {
				return err
			}

			ret = append(ret, gallery)
		}

		return nil
	}); err != nil {
		return nil, err
	}

	// execute post hooks outside of txn
	var newRet []*models.Gallery
	for _, gallery := range ret {
		r.hookExecutor.ExecutePostHooks(ctx, gallery.ID, hook.GalleryUpdatePost, input, translator.getFields())

		gallery, err := r.getGallery(ctx, gallery.ID)
		if err != nil {
			return nil, err
		}

		newRet = append(newRet, gallery)
	}

	return newRet, nil
}

func (r *mutationResolver) GalleryDestroy(ctx context.Context, input models.GalleryDestroyInput) (bool, error) {
	galleryIDs, err := stringslice.StringSliceToIntSlice(input.Ids)
	if err != nil {
		return false, fmt.Errorf("converting ids: %w", err)
	}

	trashPath := manager.GetInstance().Config.GetDeleteTrashPath()

	var galleries []*models.Gallery
	var imgsDestroyed []*models.Image
	fileDeleter := &image.FileDeleter{
		Deleter: file.NewDeleterWithTrash(trashPath),
		Paths:   manager.GetInstance().Paths,
	}

	deleteGenerated := utils.IsTrue(input.DeleteGenerated)
	deleteFile := utils.IsTrue(input.DeleteFile)

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Gallery

		for _, id := range galleryIDs {
			gallery, err := qb.Find(ctx, id)
			if err != nil {
				return err
			}

			if gallery == nil {
				return fmt.Errorf("gallery with id %d not found", id)
			}

			if err := gallery.LoadFiles(ctx, qb); err != nil {
				return fmt.Errorf("loading files for gallery %d", id)
			}

			galleries = append(galleries, gallery)

			thisImgsDestroyed, err := r.galleryService.Destroy(ctx, gallery, fileDeleter, deleteGenerated, deleteFile)
			if err != nil {
				return err
			}

			imgsDestroyed = append(imgsDestroyed, thisImgsDestroyed...)
		}

		return nil
	}); err != nil {
		fileDeleter.Rollback()
		return false, err
	}

	// perform the post-commit actions
	fileDeleter.Commit()

	for _, gallery := range galleries {
		// don't delete stash library paths
		path := gallery.Path
		if deleteFile && path != "" && !isStashPath(path) {
			// try to remove the folder - it is possible that it is not empty
			// so swallow the error if present
			_ = os.Remove(path)
		}
	}

	// call post hook after performing the other actionsa
	for _, gallery := range galleries {
		r.hookExecutor.ExecutePostHooks(ctx, gallery.ID, hook.GalleryDestroyPost, plugin.GalleryDestroyInput{
			GalleryDestroyInput: input,
			Checksum:            gallery.PrimaryChecksum(),
			Path:                gallery.Path,
		}, nil)
	}

	// call image destroy post hook as well
	for _, img := range imgsDestroyed {
		r.hookExecutor.ExecutePostHooks(ctx, img.ID, hook.ImageDestroyPost, plugin.ImageDestroyInput{
			Checksum: img.Checksum,
			Path:     img.Path,
		}, nil)
	}

	return true, nil
}

func isStashPath(path string) bool {
	stashConfigs := manager.GetInstance().Config.GetStashPaths()
	for _, config := range stashConfigs {
		if path == config.Path {
			return true
		}
	}

	return false
}

func (r *mutationResolver) AddGalleryImages(ctx context.Context, input GalleryAddInput) (bool, error) {
	galleryID, err := strconv.Atoi(input.GalleryID)
	if err != nil {
		return false, fmt.Errorf("converting gallery id: %w", err)
	}

	imageIDs, err := stringslice.StringSliceToIntSlice(input.ImageIds)
	if err != nil {
		return false, fmt.Errorf("converting image ids: %w", err)
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Gallery
		gallery, err := qb.Find(ctx, galleryID)
		if err != nil {
			return err
		}

		if gallery == nil {
			return fmt.Errorf("gallery with id %d not found", galleryID)
		}

		return r.galleryService.AddImages(ctx, gallery, imageIDs...)
	}); err != nil {
		return false, err
	}

	return true, nil
}

func (r *mutationResolver) AddGalleryImagesByURL(ctx context.Context, input GalleryAddURLsInput) (ret *GalleryAddURLsResult, err error) {
	galleryID, err := strconv.Atoi(input.GalleryID)
	if err != nil {
		return nil, fmt.Errorf("converting gallery id: %w", err)
	}

	createdIDSet := make(map[int]struct{})
	linkedIDSet := make(map[int]struct{})
	seenURLs := make(map[string]struct{})

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Gallery
		gallery, err := qb.Find(ctx, galleryID)
		if err != nil {
			return err
		}

		if gallery == nil {
			return fmt.Errorf("gallery with id %d not found", galleryID)
		}

		for _, scrapedURL := range input.Urls {
			normalizedURL := strings.TrimSpace(scrapedURL)
			if normalizedURL == "" {
				continue
			}

			if _, exists := seenURLs[normalizedURL]; exists {
				continue
			}
			seenURLs[normalizedURL] = struct{}{}

			foundIDs, err := r.findImageIDsByURL(ctx, normalizedURL)
			if err != nil {
				return err
			}

			if len(foundIDs) == 0 {
				imageID, created, err := r.getOrCreateLocalImageByURL(ctx, normalizedURL)
				if err != nil {
					logger.Warnf("Failed to import gallery image from %q: %v", normalizedURL, err)
					continue
				}

				foundIDs = []int{imageID}
				if created {
					createdIDSet[imageID] = struct{}{}
				}
			} else {
				for _, imageID := range foundIDs {
					if err := r.ensureImageHasLocalFile(ctx, imageID, normalizedURL); err != nil {
						logger.Warnf("Failed to localize existing image %d from %q: %v", imageID, normalizedURL, err)
					}
				}
			}

			for _, imageID := range foundIDs {
				linkedIDSet[imageID] = struct{}{}
			}
		}

		if len(linkedIDSet) > 0 {
			linkedIDs := make([]int, 0, len(linkedIDSet))
			for id := range linkedIDSet {
				linkedIDs = append(linkedIDs, id)
			}
			sort.Ints(linkedIDs)

			if err := r.galleryService.AddImages(ctx, gallery, linkedIDs...); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return nil, err
	}

	createdIDs := make([]string, 0, len(createdIDSet))
	for id := range createdIDSet {
		createdIDs = append(createdIDs, strconv.Itoa(id))
	}
	sort.Strings(createdIDs)

	linkedIDs := make([]string, 0, len(linkedIDSet))
	for id := range linkedIDSet {
		linkedIDs = append(linkedIDs, strconv.Itoa(id))
	}
	sort.Strings(linkedIDs)

	return &GalleryAddURLsResult{
		CreatedIds: createdIDs,
		LinkedIds:  linkedIDs,
	}, nil
}

func (r *mutationResolver) findImageIDsByURL(ctx context.Context, imageURL string) ([]int, error) {
	queryResult, err := r.repository.Image.Query(ctx, models.ImageQueryOptions{
		ImageFilter: &models.ImageFilterType{
			URL: &models.StringCriterionInput{
				Value:    imageURL,
				Modifier: models.CriterionModifierEquals,
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("querying image by url %q: %w", imageURL, err)
	}

	images, err := queryResult.Resolve(ctx)
	if err != nil {
		return nil, fmt.Errorf("resolving images by url %q: %w", imageURL, err)
	}

	ret := make([]int, 0, len(images))
	for _, image := range images {
		ret = append(ret, image.ID)
	}

	return ret, nil
}

func imageTitleFromURL(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}

	base := path.Base(u.Path)
	if base == "." || base == "/" {
		return ""
	}

	return strings.TrimSpace(base)
}

var galleryScrapedImageMimeExt = map[string]string{
	"image/avif":      ".avif",
	"image/bmp":       ".bmp",
	"image/gif":       ".gif",
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/svg+xml":   ".svg",
	"image/tiff":      ".tiff",
	"image/webp":      ".webp",
	"video/webm":      ".webm",
	"video/mp4":       ".mp4",
	"application/pdf": ".pdf",
}

var galleryScrapedAllowedExt = map[string]struct{}{
	".avif": {},
	".bmp":  {},
	".gif":  {},
	".jpeg": {},
	".jpg":  {},
	".mp4":  {},
	".pdf":  {},
	".png":  {},
	".svg":  {},
	".tif":  {},
	".tiff": {},
	".webm": {},
	".webp": {},
}

func galleryScrapedImageStoreRoot() (string, error) {
	stashes := manager.GetInstance().Config.GetStashPaths()

	for _, stash := range stashes {
		if stash == nil {
			continue
		}

		stashPath := strings.TrimSpace(stash.Path)
		if stashPath == "" {
			continue
		}

		if !stash.ExcludeImage {
			return filepath.Join(stashPath, ".stash-scraped", "gallery-images"), nil
		}
	}

	for _, stash := range stashes {
		if stash == nil {
			continue
		}

		stashPath := strings.TrimSpace(stash.Path)
		if stashPath == "" {
			continue
		}

		return filepath.Join(stashPath, ".stash-scraped", "gallery-images"), nil
	}

	return "", errors.New("no stash paths configured to store scraped gallery images")
}

func galleryScrapedImageHash(imageURL string) string {
	sum := sha1.Sum([]byte(imageURL))
	return hex.EncodeToString(sum[:])
}

func findDownloadedGalleryScrapedImagePath(storeRoot string, hash string) (string, error) {
	if len(hash) < 4 {
		return "", fmt.Errorf("invalid image hash %q", hash)
	}

	pattern := filepath.Join(storeRoot, hash[:2], hash[2:4], hash+".*")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return "", fmt.Errorf("invalid image glob pattern %q: %w", pattern, err)
	}

	if len(matches) == 0 {
		return "", nil
	}

	sort.Strings(matches)
	return matches[0], nil
}

func imageExtensionFromURL(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}

	ext := strings.ToLower(filepath.Ext(u.Path))
	if _, ok := galleryScrapedAllowedExt[ext]; ok {
		return ext
	}

	return ""
}

func inferGalleryScrapedImageExtension(imageURL string, data []byte) string {
	if ext := imageExtensionFromURL(imageURL); ext != "" {
		return ext
	}

	detectedMime := http.DetectContentType(data)
	detectedMime = strings.TrimSpace(strings.ToLower(strings.SplitN(detectedMime, ";", 2)[0]))
	if ext, ok := galleryScrapedImageMimeExt[detectedMime]; ok {
		return ext
	}

	return ".jpg"
}

func (r *mutationResolver) ensureDownloadedGalleryScrapedImage(ctx context.Context, imageURL string) (string, error) {
	storeRoot, err := galleryScrapedImageStoreRoot()
	if err != nil {
		return "", err
	}

	hash := galleryScrapedImageHash(imageURL)

	existingPath, err := findDownloadedGalleryScrapedImagePath(storeRoot, hash)
	if err != nil {
		return "", err
	}

	if existingPath != "" {
		return existingPath, nil
	}

	data, err := utils.ReadImageFromURL(ctx, imageURL)
	if err != nil {
		return "", fmt.Errorf("downloading image %q: %w", imageURL, err)
	}

	if len(data) == 0 {
		return "", fmt.Errorf("downloading image %q: empty body", imageURL)
	}

	ext := inferGalleryScrapedImageExtension(imageURL, data)
	localPath := filepath.Join(storeRoot, hash[:2], hash[2:4], hash+ext)

	if exists, _ := fsutil.FileExists(localPath); exists {
		return localPath, nil
	}

	if err := fsutil.WriteFile(localPath, data); err != nil {
		return "", fmt.Errorf("writing downloaded image to %q: %w", localPath, err)
	}

	return localPath, nil
}

func (r *mutationResolver) getOrCreateImageFileForPath(ctx context.Context, localPath string) (models.FileID, error) {
	const caseSensitive = true
	existingFile, err := r.repository.File.FindByPath(ctx, localPath, caseSensitive)
	if err != nil {
		return 0, fmt.Errorf("finding file by path %q: %w", localPath, err)
	}

	if existingFile != nil {
		return existingFile.Base().ID, nil
	}

	stat, err := os.Stat(localPath)
	if err != nil {
		return 0, fmt.Errorf("stat file %q: %w", localPath, err)
	}

	parentFolder, err := file.GetOrCreateFolderHierarchy(ctx, r.repository.Folder, filepath.Dir(localPath))
	if err != nil {
		return 0, fmt.Errorf("finding/creating folder hierarchy for %q: %w", localPath, err)
	}

	fileMD5, err := md5.FromFilePath(localPath)
	if err != nil {
		return 0, fmt.Errorf("calculating md5 for %q: %w", localPath, err)
	}

	now := time.Now()
	baseFile := &models.BaseFile{
		DirEntry: models.DirEntry{
			ModTime: stat.ModTime().Truncate(time.Second),
		},
		Path:           localPath,
		Basename:       filepath.Base(localPath),
		ParentFolderID: parentFolder.ID,
		Size:           stat.Size(),
		CreatedAt:      now,
		UpdatedAt:      now,
		Fingerprints: models.Fingerprints{
			{
				Type:        models.FingerprintTypeMD5,
				Fingerprint: fileMD5,
			},
		},
	}

	newFile := models.File(baseFile)
	decorator := &file_image.Decorator{
		FFProbe: manager.GetInstance().FFProbe,
	}

	decoratedFile, err := decorator.Decorate(ctx, &file.OsFS{}, baseFile)
	if err != nil {
		logger.Warnf("Could not read image metadata for %q: %v", localPath, err)
	} else {
		newFile = decoratedFile
	}

	if err := r.repository.File.Create(ctx, newFile); err != nil {
		// Another operation may have created this path concurrently.
		existingFile, findErr := r.repository.File.FindByPath(ctx, localPath, caseSensitive)
		if findErr == nil && existingFile != nil {
			return existingFile.Base().ID, nil
		}

		return 0, fmt.Errorf("creating file for %q: %w", localPath, err)
	}

	return newFile.Base().ID, nil
}

func (r *mutationResolver) addURLToImage(ctx context.Context, imageID int, imageURL string) error {
	img, err := r.repository.Image.Find(ctx, imageID)
	if err != nil {
		return fmt.Errorf("finding image %d: %w", imageID, err)
	}

	if img == nil {
		return fmt.Errorf("image with id %d not found", imageID)
	}

	if err := img.LoadURLs(ctx, r.repository.Image); err != nil {
		return fmt.Errorf("loading image urls for %d: %w", imageID, err)
	}

	for _, existingURL := range img.URLs.List() {
		if existingURL == imageURL {
			return nil
		}
	}

	partial := models.NewImagePartial()
	partial.URLs = &models.UpdateStrings{
		Values: []string{imageURL},
		Mode:   models.RelationshipUpdateModeAdd,
	}

	if _, err := r.repository.Image.UpdatePartial(ctx, imageID, partial); err != nil {
		return fmt.Errorf("adding url %q to image %d: %w", imageURL, imageID, err)
	}

	return nil
}

func (r *mutationResolver) ensureImageHasLocalFile(ctx context.Context, imageID int, imageURL string) error {
	img, err := r.repository.Image.Find(ctx, imageID)
	if err != nil {
		return fmt.Errorf("finding image %d: %w", imageID, err)
	}

	if img == nil {
		return fmt.Errorf("image with id %d not found", imageID)
	}

	if err := img.LoadFiles(ctx, r.repository.Image); err != nil {
		return fmt.Errorf("loading files for image %d: %w", imageID, err)
	}

	if len(img.Files.List()) > 0 {
		return r.addURLToImage(ctx, imageID, imageURL)
	}

	fileID, err := r.getOrCreateLocalImageFileIDFromURL(ctx, imageURL)
	if err != nil {
		return err
	}

	if err := r.repository.Image.AddFileID(ctx, imageID, fileID); err != nil {
		return fmt.Errorf("adding file %d to image %d: %w", fileID, imageID, err)
	}

	partial := models.NewImagePartial()
	partial.PrimaryFileID = &fileID
	partial.URLs = &models.UpdateStrings{
		Values: []string{imageURL},
		Mode:   models.RelationshipUpdateModeAdd,
	}

	if _, err := r.repository.Image.UpdatePartial(ctx, imageID, partial); err != nil {
		return fmt.Errorf("updating image %d after local file import: %w", imageID, err)
	}

	return nil
}

func (r *mutationResolver) getOrCreateLocalImageFileIDFromURL(ctx context.Context, imageURL string) (models.FileID, error) {
	localPath, err := r.ensureDownloadedGalleryScrapedImage(ctx, imageURL)
	if err != nil {
		return 0, err
	}

	fileID, err := r.getOrCreateImageFileForPath(ctx, localPath)
	if err != nil {
		return 0, err
	}

	return fileID, nil
}

func (r *mutationResolver) getOrCreateLocalImageByURL(ctx context.Context, imageURL string) (int, bool, error) {
	fileID, err := r.getOrCreateLocalImageFileIDFromURL(ctx, imageURL)
	if err != nil {
		return 0, false, err
	}

	existingImages, err := r.repository.Image.FindByFileID(ctx, fileID)
	if err != nil {
		return 0, false, fmt.Errorf("finding image by file id %d: %w", fileID, err)
	}

	if len(existingImages) > 0 {
		imageID := existingImages[0].ID
		if err := r.addURLToImage(ctx, imageID, imageURL); err != nil {
			return 0, false, err
		}

		return imageID, false, nil
	}

	newImage := models.NewImage()
	newImage.URLs = models.NewRelatedStrings([]string{imageURL})
	newImage.Title = imageTitleFromURL(imageURL)
	if newImage.Title == "" {
		newImage.Title = filepath.Base(strings.TrimSpace(imageURL))
	}

	if err := r.repository.Image.Create(ctx, &newImage, []models.FileID{fileID}); err != nil {
		// Another operation may have created the image concurrently.
		existingImages, findErr := r.repository.Image.FindByFileID(ctx, fileID)
		if findErr == nil && len(existingImages) > 0 {
			return existingImages[0].ID, false, nil
		}

		return 0, false, fmt.Errorf("creating image for url %q: %w", imageURL, err)
	}

	return newImage.ID, true, nil
}

func (r *mutationResolver) RemoveGalleryImages(ctx context.Context, input GalleryRemoveInput) (bool, error) {
	galleryID, err := strconv.Atoi(input.GalleryID)
	if err != nil {
		return false, fmt.Errorf("converting gallery id: %w", err)
	}

	imageIDs, err := stringslice.StringSliceToIntSlice(input.ImageIds)
	if err != nil {
		return false, fmt.Errorf("converting image ids: %w", err)
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Gallery
		gallery, err := qb.Find(ctx, galleryID)
		if err != nil {
			return err
		}

		if gallery == nil {
			return fmt.Errorf("gallery with id %d not found", galleryID)
		}

		return r.galleryService.RemoveImages(ctx, gallery, imageIDs...)
	}); err != nil {
		return false, err
	}

	return true, nil
}

func (r *mutationResolver) SetGalleryCover(ctx context.Context, input GallerySetCoverInput) (bool, error) {
	galleryID, err := strconv.Atoi(input.GalleryID)
	if err != nil {
		return false, fmt.Errorf("converting gallery id: %w", err)
	}

	coverImageID, err := strconv.Atoi(input.CoverImageID)
	if err != nil {
		return false, fmt.Errorf("converting cover image id: %w", err)
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Gallery
		gallery, err := qb.Find(ctx, galleryID)
		if err != nil {
			return err
		}

		if gallery == nil {
			return fmt.Errorf("gallery with id %d not found", galleryID)
		}

		return r.galleryService.SetCover(ctx, gallery, coverImageID)
	}); err != nil {
		return false, err
	}

	return true, nil
}

func (r *mutationResolver) ResetGalleryCover(ctx context.Context, input GalleryResetCoverInput) (bool, error) {
	galleryID, err := strconv.Atoi(input.GalleryID)
	if err != nil {
		return false, fmt.Errorf("converting gallery id: %w", err)
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Gallery
		gallery, err := qb.Find(ctx, galleryID)
		if err != nil {
			return err
		}

		if gallery == nil {
			return fmt.Errorf("gallery with id %d not found", galleryID)
		}

		return r.galleryService.ResetCover(ctx, gallery)
	}); err != nil {
		return false, err
	}

	return true, nil
}

func (r *mutationResolver) getGalleryChapter(ctx context.Context, id int) (ret *models.GalleryChapter, err error) {
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		ret, err = r.repository.GalleryChapter.Find(ctx, id)
		return err
	}); err != nil {
		return nil, err
	}

	return ret, nil
}

func (r *mutationResolver) GalleryChapterCreate(ctx context.Context, input GalleryChapterCreateInput) (*models.GalleryChapter, error) {
	galleryID, err := strconv.Atoi(input.GalleryID)
	if err != nil {
		return nil, fmt.Errorf("converting gallery id: %w", err)
	}

	// Populate a new gallery chapter from the input
	newChapter := models.NewGalleryChapter()

	newChapter.Title = input.Title
	newChapter.ImageIndex = input.ImageIndex
	newChapter.GalleryID = galleryID

	// Start the transaction and save the gallery chapter
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		imageCount, err := r.repository.Image.CountByGalleryID(ctx, galleryID)
		if err != nil {
			return err
		}

		// Sanity Check of Index
		if newChapter.ImageIndex > imageCount || newChapter.ImageIndex < 1 {
			return errors.New("Image # must greater than zero and in range of the gallery images")
		}

		return r.repository.GalleryChapter.Create(ctx, &newChapter)
	}); err != nil {
		return nil, err
	}

	r.hookExecutor.ExecutePostHooks(ctx, newChapter.ID, hook.GalleryChapterCreatePost, input, nil)
	return r.getGalleryChapter(ctx, newChapter.ID)
}

func (r *mutationResolver) GalleryChapterUpdate(ctx context.Context, input GalleryChapterUpdateInput) (*models.GalleryChapter, error) {
	chapterID, err := strconv.Atoi(input.ID)
	if err != nil {
		return nil, fmt.Errorf("converting id: %w", err)
	}

	translator := changesetTranslator{
		inputMap: getUpdateInputMap(ctx),
	}

	// Populate gallery chapter from the input
	updatedChapter := models.NewGalleryChapterPartial()

	updatedChapter.Title = translator.optionalString(input.Title, "title")
	updatedChapter.ImageIndex = translator.optionalInt(input.ImageIndex, "image_index")
	updatedChapter.GalleryID, err = translator.optionalIntFromString(input.GalleryID, "gallery_id")
	if err != nil {
		return nil, fmt.Errorf("converting gallery id: %w", err)
	}

	// Start the transaction and save the gallery chapter
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.GalleryChapter

		existingChapter, err := qb.Find(ctx, chapterID)
		if err != nil {
			return err
		}
		if existingChapter == nil {
			return fmt.Errorf("gallery chapter with id %d not found", chapterID)
		}

		galleryID := existingChapter.GalleryID
		imageIndex := existingChapter.ImageIndex

		if updatedChapter.GalleryID.Set {
			galleryID = updatedChapter.GalleryID.Value
		}
		if updatedChapter.ImageIndex.Set {
			imageIndex = updatedChapter.ImageIndex.Value
		}

		imageCount, err := r.repository.Image.CountByGalleryID(ctx, galleryID)
		if err != nil {
			return err
		}

		// Sanity Check of Index
		if imageIndex > imageCount || imageIndex < 1 {
			return errors.New("Image # must greater than zero and in range of the gallery images")
		}

		_, err = qb.UpdatePartial(ctx, chapterID, updatedChapter)
		if err != nil {
			return err
		}

		return nil
	}); err != nil {
		return nil, err
	}

	r.hookExecutor.ExecutePostHooks(ctx, chapterID, hook.GalleryChapterUpdatePost, input, translator.getFields())
	return r.getGalleryChapter(ctx, chapterID)
}

func (r *mutationResolver) GalleryChapterDestroy(ctx context.Context, id string) (bool, error) {
	chapterID, err := strconv.Atoi(id)
	if err != nil {
		return false, fmt.Errorf("converting id: %w", err)
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.GalleryChapter

		chapter, err := qb.Find(ctx, chapterID)

		if err != nil {
			return err
		}

		if chapter == nil {
			return fmt.Errorf("gallery chapter with id %d not found", chapterID)
		}

		return gallery.DestroyChapter(ctx, chapter, qb)
	}); err != nil {
		return false, err
	}

	r.hookExecutor.ExecutePostHooks(ctx, chapterID, hook.GalleryChapterDestroyPost, id, nil)

	return true, nil
}

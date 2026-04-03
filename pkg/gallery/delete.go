package gallery

import (
	"context"

	"github.com/stashapp/stash/pkg/file"
	"github.com/stashapp/stash/pkg/image"
	"github.com/stashapp/stash/pkg/models"
)

func (s *Service) Destroy(ctx context.Context, i *models.Gallery, fileDeleter *image.FileDeleter, deleteGenerated, deleteFile, destroyFileEntry bool) ([]*models.Image, error) {
	var imgsDestroyed []*models.Image

	// chapter deletion is done via delete cascade, so we don't need to do anything here

	// if this is a zip-based gallery, delete the images as well first
	zipImgsDestroyed, err := s.destroyZipFileImages(ctx, i, fileDeleter, deleteGenerated, deleteFile, destroyFileEntry)
	if err != nil {
		return nil, err
	}

	imgsDestroyed = zipImgsDestroyed

	// only delete folder based gallery images if we're deleting the folder
	if deleteFile && i.FolderID != nil {
		folderImgsDestroyed, err := s.ImageService.DestroyFolderImages(ctx, *i.FolderID, fileDeleter, deleteGenerated, deleteFile)
		if err != nil {
			return nil, err
		}

		imgsDestroyed = append(imgsDestroyed, folderImgsDestroyed...)
	}

	// delete any gallery-linked images that are not attached to another gallery.
	// This covers user-created/URL-only galleries (for example imported via AddGalleryImagesByURL)
	// that are not folder/zip-based.
	if deleteFile {
		linkedImgsDestroyed, err := s.destroyLinkedImages(ctx, i, fileDeleter, deleteGenerated)
		if err != nil {
			return nil, err
		}

		imgsDestroyed = append(imgsDestroyed, linkedImgsDestroyed...)
	}

	// we only want to delete a folder-based gallery if it is empty.
	// this has to be done post-transaction

	if err := s.Repository.Destroy(ctx, i.ID); err != nil {
		return nil, err
	}

	return imgsDestroyed, nil
}

func DestroyChapter(ctx context.Context, galleryChapter *models.GalleryChapter, qb models.GalleryChapterDestroyer) error {
	return qb.Destroy(ctx, galleryChapter.ID)
}

func (s *Service) destroyZipFileImages(ctx context.Context, i *models.Gallery, fileDeleter *image.FileDeleter, deleteGenerated, deleteFile, destroyFileEntry bool) ([]*models.Image, error) {
	if err := i.LoadFiles(ctx, s.Repository); err != nil {
		return nil, err
	}

	var imgsDestroyed []*models.Image

	destroyer := &file.ZipDestroyer{
		FileDestroyer:   s.File,
		FolderDestroyer: s.Folder,
	}

	// for zip-based galleries, delete the images as well first
	for _, f := range i.Files.List() {
		// only do this where there are no other galleries related to the file
		otherGalleries, err := s.Repository.FindByFileID(ctx, f.Base().ID)
		if err != nil {
			return nil, err
		}

		if len(otherGalleries) > 1 {
			// other gallery associated, don't remove
			continue
		}

		thisDestroyed, err := s.ImageService.DestroyZipImages(ctx, f, fileDeleter, deleteGenerated)
		if err != nil {
			return nil, err
		}

		imgsDestroyed = append(imgsDestroyed, thisDestroyed...)

		if deleteFile {
			if err := destroyer.DestroyZip(ctx, f, fileDeleter.Deleter, deleteFile); err != nil {
				return nil, err
			}
		} else if destroyFileEntry {
			// destroy file DB entry without deleting filesystem file
			const deleteFileFromFS = false
			if err := destroyer.DestroyZip(ctx, f, nil, deleteFileFromFS); err != nil {
				return nil, err
			}
		}
	}

	return imgsDestroyed, nil
}

func (s *Service) destroyLinkedImages(ctx context.Context, i *models.Gallery, fileDeleter *image.FileDeleter, deleteGenerated bool) ([]*models.Image, error) {
	linkedImgs, err := s.ImageFinder.FindByGalleryID(ctx, i.ID)
	if err != nil {
		return nil, err
	}

	var imgsDestroyed []*models.Image
	seen := make(map[int]struct{})

	for _, img := range linkedImgs {
		if img == nil {
			continue
		}

		if _, ok := seen[img.ID]; ok {
			continue
		}
		seen[img.ID] = struct{}{}

		if err := img.LoadGalleryIDs(ctx, s.ImageFinder); err != nil {
			return nil, err
		}

		// only destroy images that are not attached to other galleries
		if len(img.GalleryIDs.List()) > 1 {
			continue
		}

		const deleteFile = true
		const destroyFileEntry = false
		if err := s.ImageService.Destroy(ctx, img, fileDeleter, deleteGenerated, deleteFile, destroyFileEntry); err != nil {
			return nil, err
		}

		imgsDestroyed = append(imgsDestroyed, img)
	}

	return imgsDestroyed, nil
}

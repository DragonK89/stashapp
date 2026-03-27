package video

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/stashapp/stash/pkg/ffmpeg"
	"github.com/stashapp/stash/pkg/file"
	"github.com/stashapp/stash/pkg/models"
)

// Decorator adds video specific fields to a File.
type Decorator struct {
	FFProbe *ffmpeg.FFProbe
}

func (d *Decorator) Decorate(ctx context.Context, fs models.FS, f models.File) (models.File, error) {
	base := f.Base()

	// `.torrent` files are treated as scan-able "video-like placeholders" so they can be
	// associated with Scenes, but they must not invoke ffprobe.
	if strings.EqualFold(filepath.Ext(base.Path), ".torrent") {
		const (
			unsetString = "unset"
			unsetNumber = -1
		)

		return &models.VideoFile{
			BaseFile:    base,
			Format:      unsetString,
			VideoCodec:  unsetString,
			AudioCodec:  unsetString,
			Width:       unsetNumber,
			Height:      unsetNumber,
			Duration:    float64(unsetNumber),
			FrameRate:   float64(unsetNumber),
			BitRate:     int64(unsetNumber),
			Interactive: false,
		}, nil
	}

	if d.FFProbe == nil {
		return f, errors.New("ffprobe not configured")
	}

	// TODO - copy to temp file if not an OsFS
	if _, isOs := fs.(*file.OsFS); !isOs {
		return f, fmt.Errorf("video.constructFile: only OsFS is supported")
	}

	probe := d.FFProbe
	videoFile, err := probe.NewVideoFile(base.Path)
	if err != nil {
		return f, fmt.Errorf("running ffprobe on %q: %w", base.Path, err)
	}

	container, err := ffmpeg.MatchContainer(videoFile.Container, base.Path)
	if err != nil {
		return f, fmt.Errorf("matching container for %q: %w", base.Path, err)
	}

	// check if there is a funscript file
	interactive := false
	if _, err := fs.Lstat(GetFunscriptPath(base.Path)); err == nil {
		interactive = true
	}

	return &models.VideoFile{
		BaseFile:    base,
		Format:      string(container),
		VideoCodec:  videoFile.VideoCodec,
		AudioCodec:  videoFile.AudioCodec,
		Width:       videoFile.Width,
		Height:      videoFile.Height,
		Duration:    videoFile.FileDuration,
		FrameRate:   videoFile.FrameRate,
		BitRate:     videoFile.Bitrate,
		Interactive: interactive,
	}, nil
}

func (d *Decorator) IsMissingMetadata(ctx context.Context, fs models.FS, f models.File) bool {
	const (
		unsetString = "unset"
		unsetNumber = -1
	)

	vf, ok := f.(*models.VideoFile)
	if !ok {
		return true
	}

	interactive := false
	if _, err := fs.Lstat(GetFunscriptPath(vf.Base().Path)); err == nil {
		interactive = true
	}

	return vf.VideoCodec == unsetString || vf.AudioCodec == unsetString ||
		vf.Format == unsetString || vf.Width == unsetNumber ||
		vf.Height == unsetNumber || vf.FrameRate == unsetNumber ||
		vf.Duration == unsetNumber ||
		vf.BitRate == unsetNumber || interactive != vf.Interactive
}

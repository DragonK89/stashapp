package config

type ScanMetadataOptions struct {
	// Forces a rescan on files even if they have not changed
	Rescan bool `json:"rescan"`
	// Torrent-only scan. When enabled, only .torrent files are scanned.
	ScanTorrents bool `json:"scanTorrents"`
	// When ScanTorrents is enabled, normalize torrent scene title using strict PREFIX-NUMBER parsing.
	ScanTorrentsNormalizeTitle bool `json:"scanTorrentsNormalizeTitle"`
	// When ScanTorrentsNormalizeTitle is enabled, optionally rename torrent files to match the normalized title.
	ScanTorrentsRenameFile bool `json:"scanTorrentsRenameFile"`
	// Generate scene covers during scan
	ScanGenerateCovers bool `json:"scanGenerateCovers"`
	// Generate previews during scan
	ScanGeneratePreviews bool `json:"scanGeneratePreviews"`
	// Generate image previews during scan
	ScanGenerateImagePreviews bool `json:"scanGenerateImagePreviews"`
	// Generate sprites during scan
	ScanGenerateSprites bool `json:"scanGenerateSprites"`
	// Generate phashes during scan
	ScanGeneratePhashes bool `json:"scanGeneratePhashes"`
	// Generate image thumbnails during scan
	ScanGenerateThumbnails bool `json:"scanGenerateThumbnails"`
	// Generate image thumbnails during scan
	ScanGenerateClipPreviews bool `json:"scanGenerateClipPreviews"`
}

type AutoTagMetadataOptions struct {
	// IDs of performers to tag files with, or "*" for all
	Performers []string `json:"performers"`
	// IDs of studios to tag files with, or "*" for all
	Studios []string `json:"studios"`
	// IDs of labels to tag files with, or "*" for all
	Labels []string `json:"labels"`
	// IDs of tags to tag files with, or "*" for all
	Tags []string `json:"tags"`
}

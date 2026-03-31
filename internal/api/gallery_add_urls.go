package api

type GalleryAddURLsInput struct {
	GalleryID string   `json:"gallery_id"`
	Urls      []string `json:"urls"`
}

type GalleryAddURLsResult struct {
	CreatedIds []string `json:"created_ids"`
	LinkedIds  []string `json:"linked_ids"`
}

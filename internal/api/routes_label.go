package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/stashapp/stash/internal/static"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/utils"
)

type LabelFinder interface {
	models.LabelGetter
	GetImage(ctx context.Context, labelID int) ([]byte, error)
}

type labelRoutes struct {
	routes
	labelFinder LabelFinder
}

func (rs labelRoutes) Routes() chi.Router {
	r := chi.NewRouter()

	r.Route("/{labelId}", func(r chi.Router) {
		r.Use(rs.LabelCtx)
		r.Get("/image", rs.Image)
	})

	return r
}

func (rs labelRoutes) Image(w http.ResponseWriter, r *http.Request) {
	label := r.Context().Value(labelKey).(*models.Label)
	defaultParam := r.URL.Query().Get("default")

	var image []byte
	if defaultParam != "true" {
		readTxnErr := rs.withReadTxn(r, func(ctx context.Context) error {
			var err error
			image, err = rs.labelFinder.GetImage(ctx, label.ID)
			return err
		})
		if errors.Is(readTxnErr, context.Canceled) {
			return
		}
		if readTxnErr != nil {
			logger.Warnf("read transaction error on fetch label image: %v", readTxnErr)
		}
	}

	// fallback to default image (using the same SVG as tags for now)
	if len(image) == 0 {
		image = static.ReadAll(static.DefaultTagImage)
	}

	utils.ServeImage(w, r, image)
}

func (rs labelRoutes) LabelCtx(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		labelID, err := strconv.Atoi(chi.URLParam(r, "labelId"))
		if err != nil {
			http.Error(w, http.StatusText(404), 404)
			return
		}

		var label *models.Label
		_ = rs.withReadTxn(r, func(ctx context.Context) error {
			var err error
			label, err = rs.labelFinder.Find(ctx, labelID)
			return err
		})
		if label == nil {
			http.Error(w, http.StatusText(404), 404)
			return
		}

		ctx := context.WithValue(r.Context(), labelKey, label)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

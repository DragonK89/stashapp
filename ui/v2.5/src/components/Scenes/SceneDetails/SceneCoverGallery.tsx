import React, { useEffect, useMemo, useRef, useState } from "react";
import * as GQL from "src/core/generated-graphql";
import {
  CriterionModifier,
  SortDirectionEnum,
  useFindImagesQuery,
} from "src/core/generated-graphql";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import cx from "classnames";
import { useLightbox } from "src/hooks/Lightbox/hooks";
import { gql, useQuery } from "@apollo/client";

interface IProps {
  scene: GQL.SceneDataFragment;
  galleryId?: string;
}

interface IGalleryImage {
  id: string;
  src: string;
  thumbnail: string;
  title: string;
}

interface IFindGalleryCoverData {
  findGallery?: {
    id: string;
    cover?: {
      id: string;
    } | null;
  } | null;
}

const FIND_GALLERY_COVER = gql`
  query SceneCoverGalleryFindCover($id: ID!) {
    findGallery(id: $id) {
      id
      cover {
        id
      }
    }
  }
`;

export const SceneCoverGallery: React.FC<IProps> = ({ scene, galleryId }) => {
  const [selectedImage, setSelectedImage] = useState<IGalleryImage | null>(
    null
  );
  const thumbnailsRef = useRef<HTMLDivElement | null>(null);

  const { data, loading } = useFindImagesQuery({
    variables: {
      filter: {
        per_page: -1,
        sort: "title",
        direction: SortDirectionEnum.Asc,
      },
      image_filter: {
        galleries: galleryId
          ? {
              modifier: CriterionModifier.Includes,
              value: [galleryId],
            }
          : undefined,
      },
    },
    skip: !galleryId,
  });

  const { data: galleryCoverData } = useQuery<IFindGalleryCoverData>(
    FIND_GALLERY_COVER,
    {
      variables: { id: galleryId ?? "" },
      skip: !galleryId,
    }
  );

  const rawImages = useMemo(() => data?.findImages?.images ?? [], [data]);
  const showLightbox = useLightbox();

  const galleryImages = useMemo(() => {
    if (!galleryId) {
      return [
        {
          id: "cover",
          src: scene.paths.screenshot ?? "",
          thumbnail: scene.paths.screenshot ?? "",
          title: "Cover",
        },
      ];
    }

    const images: IGalleryImage[] = rawImages.map((img) => ({
      id: img.id,
      src: img.paths.image ?? img.paths.thumbnail ?? "",
      thumbnail: img.paths.thumbnail ?? img.paths.image ?? "",
      title: img.title ?? "",
    }));

    images.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    const coverId = galleryCoverData?.findGallery?.cover?.id;
    if (coverId) {
      const coverIndex = images.findIndex((img) => img.id === coverId);
      if (coverIndex > 0) {
        const [coverImage] = images.splice(coverIndex, 1);
        images.unshift(coverImage);
      }
    }

    return images;
  }, [galleryCoverData, galleryId, rawImages, scene.paths.screenshot]);

  useEffect(() => {
    if (!selectedImage) return;
    if (galleryImages.some((img) => img.id === selectedImage.id)) return;
    setSelectedImage(null);
  }, [galleryImages, selectedImage]);

  const currentImage = selectedImage || galleryImages[0];
  const lightboxImages = useMemo(() => {
    if (!galleryId) return [];

    const rawById = new Map(rawImages.map((img) => [img.id, img]));
    return galleryImages
      .map((img) => rawById.get(img.id))
      .filter((img): img is NonNullable<typeof img> => !!img);
  }, [galleryId, galleryImages, rawImages]);

  function onMainImageClick() {
    if (!galleryId || !currentImage || lightboxImages.length === 0) return;
    const imageIndex = lightboxImages.findIndex(
      (img) => img.id === currentImage.id
    );
    showLightbox({
      images: lightboxImages,
      showNavigation: false,
      initialIndex: imageIndex >= 0 ? imageIndex : 0,
    });
  }

  useEffect(() => {
    const el = thumbnailsRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      const delta =
        Math.abs(event.deltaY) > Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;

      if (delta === 0) return;

      event.preventDefault();
      el.scrollLeft += delta;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  if (loading && galleryId && galleryImages.length === 0)
    return <LoadingIndicator />;
  if (!currentImage) return null;

  return (
    <div className="scene-cover-gallery">
      <div
        className={cx("gallery-main-image", { clickable: !!galleryId })}
        style={{ backgroundImage: `url(${currentImage.src})` }}
        onClick={onMainImageClick}
        role={galleryId ? "button" : undefined}
        tabIndex={galleryId ? 0 : undefined}
        onKeyDown={(e) => {
          if (!galleryId) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onMainImageClick();
          }
        }}
      >
        <div className="gallery-main-content">
          <img
            src={currentImage.src}
            alt={currentImage.title || scene.title || "Scene cover"}
            className="scene-cover-image"
          />
        </div>
      </div>

      {galleryImages.length > 1 && (
        <div className="gallery-thumbnails" ref={thumbnailsRef}>
          {galleryImages.map((img) => (
            <OverlayTrigger
              key={img.id}
              placement="top"
              overlay={
                <Tooltip id={`tooltip-${img.id}`}>
                  {img.id === "cover" ? "Cover" : img.title || "Untitled"}
                </Tooltip>
              }
            >
              <div
                className={cx("thumbnail-item", {
                  active: currentImage.id === img.id,
                })}
                onClick={() => setSelectedImage(img)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedImage(img);
                  }
                }}
              >
                <img src={img.thumbnail} alt={img.title || "thumbnail"} />
              </div>
            </OverlayTrigger>
          ))}
        </div>
      )}
    </div>
  );
};

export default SceneCoverGallery;

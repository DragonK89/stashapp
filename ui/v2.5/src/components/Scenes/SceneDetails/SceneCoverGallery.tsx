import React, { useState, useMemo, useRef } from "react";
import * as GQL from "src/core/generated-graphql";
import { useFindImagesQuery, CriterionModifier } from "src/core/generated-graphql";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { OverlayTrigger, Tooltip, Button } from "react-bootstrap";
import { Icon } from "src/components/Shared/Icon";
import { faPlus, faMinus, faSync } from "@fortawesome/free-solid-svg-icons";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import cx from "classnames";

interface IProps {
  scene: GQL.SceneDataFragment;
  galleryId?: string;
}

interface IGalleryImage {
  id: string;
  src: string;
  thumbnail: string;
  title: string;
  path: string;
}

export const SceneCoverGallery: React.FC<IProps> = ({ scene, galleryId }) => {
  const [selectedImage, setSelectedImage] = useState<IGalleryImage | null>(null);
  const transformRef = useRef<any>(null);

  const { data, loading } = useFindImagesQuery({
    variables: {
      filter: {
        per_page: -1,
        sort: "path",
      },
      image_filter: {
        galleries: galleryId ? {
          modifier: CriterionModifier.Includes,
          value: [galleryId],
        } : undefined,
      },
    },
    skip: !galleryId,
  });

  const galleryImages = useMemo(() => {
    const images: IGalleryImage[] = [];

    // Always include the scene screenshot as the first image
    images.push({
      id: "cover",
      src: scene.paths.screenshot ?? "",
      thumbnail: scene.paths.screenshot ?? "",
      title: "Cover",
      path: scene.paths.screenshot ?? "",
    });

    if (data?.findImages?.images) {
      data.findImages.images.forEach((img) => {
        images.push({
          id: img.id,
          src: img.paths.image ?? img.paths.thumbnail ?? "",
          thumbnail: img.paths.thumbnail ?? "",
          title: img.title ?? "",
          path: img.visual_files[0]?.path ?? "",
        });
      });
    }

    return images;
  }, [data, scene]);

  const currentImage = selectedImage || galleryImages[0];

  const handleThumbnailClick = (img: IGalleryImage) => {
    setSelectedImage(img);
    if (transformRef.current) {
      transformRef.current.resetTransform();
    }
  };

  const onThumbnailWheel = (e: React.WheelEvent) => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  if (loading && galleryImages.length <= 1) return <LoadingIndicator />;

  const fileNameFromPath = (path: string) => {
    return path.split(/[\\/]/).pop() || "";
  };

  return (
    <div className="scene-cover-gallery">
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={1}
        maxScale={10}
        centerOnInit={true}
        doubleClick={{ disabled: false }}
        panning={{ disabled: false }}
        limitToBounds={true}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <React.Fragment>
            <TransformComponent 
              wrapperClass="gallery-main-image" 
              contentClass="gallery-main-content"
              wrapperStyle={{ backgroundImage: `url(${currentImage.src})` }}
            >
              <img
                src={currentImage.src}
                alt={currentImage.title}
                className="scene-cover-image"
              />
            </TransformComponent>

            <div className="zoom-controls">
              <Button
                variant="secondary"
                className="minimal"
                onClick={() => zoomIn(0.25)}
                title="Zoom In"
              >
                <Icon icon={faPlus} />
              </Button>
              <Button
                variant="secondary"
                className="minimal"
                onClick={() => zoomOut(0.25)}
                title="Zoom Out"
              >
                <Icon icon={faMinus} />
              </Button>
              <Button
                variant="secondary"
                className="minimal"
                onClick={() => resetTransform()}
                title="Reset Zoom"
              >
                <Icon icon={faSync} />
              </Button>
            </div>
          </React.Fragment>
        )}
      </TransformWrapper>

      {galleryImages.length > 1 && (
        <div className="gallery-thumbnails" onWheel={onThumbnailWheel}>
          {galleryImages.map((img) => (
            <OverlayTrigger
              key={img.id}
              placement="top"
              overlay={<Tooltip id={`tooltip-${img.id}`}>{img.id === "cover" ? "Cover" : fileNameFromPath(img.path)}</Tooltip>}
            >
              <div
                className={cx("thumbnail-item", { active: currentImage.id === img.id })}
                onClick={() => handleThumbnailClick(img)}
              >
                <img src={img.thumbnail} alt={img.title} />
              </div>
            </OverlayTrigger>
          ))}
        </div>
      )}
    </div>
  );
};

export default SceneCoverGallery;

import React from "react";
import { Link } from "react-router-dom";
import * as GQL from "src/core/generated-graphql";
import { GridCard } from "src/components/Shared/GridCard/GridCard";
import { HoverPopover } from "../Shared/HoverPopover";
import { Icon } from "../Shared/Icon";
import { TagLink } from "../Shared/TagLink";
import { Button, ButtonGroup } from "react-bootstrap";
import { PopoverCountButton } from "../Shared/PopoverCountButton";
import { RatingBanner } from "../Shared/RatingBanner";
import { FavoriteIcon } from "../Shared/FavoriteIcon";
import { useLabelUpdate } from "src/core/StashService";
import { faFlag } from "@fortawesome/free-solid-svg-icons";
import { OCounterButton } from "../Shared/CountButton";
import { FormattedMessage } from "react-intl";

interface IProps {
  label: GQL.LabelDataFragment;
  cardWidth?: number;
  selecting?: boolean;
  selected?: boolean;
  zoomIndex?: number;
  onSelectedChanged?: (selected: boolean, shiftKey: boolean) => void;
}

export const LabelCard: React.FC<IProps> = ({
  label,
  cardWidth,
  selecting,
  selected,
  zoomIndex,
  onSelectedChanged,
}) => {
  const [updateLabel] = useLabelUpdate();

  function onToggleFavorite(v: boolean) {
    if (label.id) {
      updateLabel({
        variables: {
          input: {
            id: label.id,
            favorite: v,
          },
        },
      });
    }
  }

  function maybeRenderStudio() {
    if (label.studio) {
      return (
        <div className="label-parent-studio">
          <FormattedMessage
            id="part_of"
            values={{
              parent: (
                <Link to={`/studios/${label.studio.id}`}>
                  {label.studio.name}
                </Link>
              ),
            }}
          />
        </div>
      );
    }
  }

  function maybeRenderScenesPopoverButton() {
    if (!label.scene_count) return;

    return (
      <PopoverCountButton
        className="scene-count"
        type="scene"
        count={label.scene_count}
        url={`/scenes?labels=${label.id}`}
      />
    );
  }

  function maybeRenderTagPopoverButton() {
    if (label.tags.length <= 0) return;

    const popoverContent = label.tags.map((tag) => (
      <TagLink key={tag.id} linkType="scene" tag={tag} />
    ));

    return (
      <HoverPopover placement="bottom" content={popoverContent}>
        <Button className="minimal tag-count">
          <Icon icon={faFlag} />
          <span>{label.tags.length}</span>
        </Button>
      </HoverPopover>
    );
  }

  function maybeRenderOCounter() {
    if (!label.o_counter) return;

    return <OCounterButton value={label.o_counter} />;
  }

  function maybeRenderPopoverButtonGroup() {
    if (label.scene_count || label.o_counter || label.tags.length > 0) {
      return (
        <>
          <hr />
          <ButtonGroup className="card-popovers">
            {maybeRenderScenesPopoverButton()}
            {maybeRenderTagPopoverButton()}
            {maybeRenderOCounter()}
          </ButtonGroup>
        </>
      );
    }
  }

  return (
    <GridCard
      className={`label-card zoom-${zoomIndex}`}
      url={`/labels/${label.id}`}
      width={cardWidth}
      title={label.name}
      linkClassName="label-card-header"
      image={
        <img
          loading="lazy"
          className="label-card-image"
          alt={label.name}
          src={label.image_path ?? ""}
        />
      }
      details={
        <div className="label-card__details">
          {maybeRenderStudio()}
          <RatingBanner rating={label.rating100} />
        </div>
      }
      overlays={
        <FavoriteIcon
          favorite={label.favorite}
          onToggleFavorite={(v) => onToggleFavorite(v)}
          size="2x"
          className="hide-not-favorite"
        />
      }
      popovers={maybeRenderPopoverButtonGroup()}
      selected={selected}
      selecting={selecting}
      onSelectedChanged={onSelectedChanged}
    />
  );
};

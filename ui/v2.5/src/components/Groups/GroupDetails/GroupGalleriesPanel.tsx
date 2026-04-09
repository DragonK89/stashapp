import React, { useCallback } from "react";
import * as GQL from "src/core/generated-graphql";
import { GalleryList } from "src/components/Galleries/GalleryList";
import { View } from "src/components/List/views";
import { makeGroupGalleryFilter } from "src/core/groups";

interface IGroupGalleriesPanel {
  active: boolean;
  group: GQL.GroupDataFragment;
}

export const GroupGalleriesPanel: React.FC<IGroupGalleriesPanel> = ({
  active,
  group,
}) => {
  const galleryFilterHook = useCallback(
    (galleryFilter: GQL.GalleryFilterType) =>
      makeGroupGalleryFilter(group.id, galleryFilter),
    [group.id]
  );

  return (
    <GalleryList
      galleryFilterHook={galleryFilterHook}
      alterQuery={active}
      view={View.GroupGalleries}
    />
  );
};

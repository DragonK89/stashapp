import React from "react";
import * as GQL from "src/core/generated-graphql";
import { FilteredSceneList } from "src/components/Scenes/SceneList";
import { useLabelFilterHook } from "src/core/labels";
import { View } from "src/components/List/views";

interface ILabelScenesPanel {
  active: boolean;
  label: GQL.LabelDataFragment;
}

export const LabelScenesPanel: React.FC<ILabelScenesPanel> = ({
  active,
  label,
}) => {
  const filterHook = useLabelFilterHook(label);
  return (
    <FilteredSceneList
      filterHook={filterHook}
      alterQuery={active}
      view={View.LabelScenes}
    />
  );
};

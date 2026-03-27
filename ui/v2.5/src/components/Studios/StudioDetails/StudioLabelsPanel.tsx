import React from "react";
import * as GQL from "src/core/generated-graphql";
import { useStudioFilterHook } from "src/core/studios";
import { LabelList } from "src/components/Labels/LabelList";
import { StudiosCriterion } from "src/models/list-filter/criteria/studios";
import { View } from "src/components/List/views";

interface IStudioLabelsPanel {
  active: boolean;
  studio: GQL.StudioDataFragment;
  showChildStudioContent?: boolean;
}

export const StudioLabelsPanel: React.FC<IStudioLabelsPanel> = ({
  active,
  studio,
  showChildStudioContent,
}) => {
  const studioCriterion = new StudiosCriterion();
  studioCriterion.value = {
    items: [{ id: studio.id!, label: studio.name || `Studio ${studio.id}` }],
    excluded: [],
    depth: 0,
  };

  const extraCriteria = {
    labels: [studioCriterion],
  };

  const filterHook = useStudioFilterHook(studio, showChildStudioContent);

  return (
    <LabelList
      filterHook={filterHook}
      extraCriteria={extraCriteria}
      alterQuery={active}
      view={View.StudioLabels}
    />
  );
};

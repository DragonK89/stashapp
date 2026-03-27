import * as GQL from "src/core/generated-graphql";
import { LabelsCriterion } from "src/models/list-filter/criteria/labels";
import { ListFilterModel } from "src/models/list-filter/filter";

export const useLabelFilterHook = (label: GQL.LabelDataFragment) => {
  return (filter: ListFilterModel) => {
    const labelValue = { id: label.id, label: label.name };
    // if label is already present, then we modify it, otherwise add
    let labelCriterion = filter.criteria.find((c) => {
      return c.criterionOption.type === "labels";
    }) as LabelsCriterion | undefined;

    if (labelCriterion) {
      // we should be showing label only. Remove other values
      labelCriterion.value.items = [labelValue];
      labelCriterion.modifier = GQL.CriterionModifier.Includes;
    } else {
      labelCriterion = new LabelsCriterion();
      labelCriterion.value = {
        items: [labelValue],
        excluded: [],
        depth: 0,
      };
      labelCriterion.modifier = GQL.CriterionModifier.Includes;
      filter.criteria.push(labelCriterion);
    }

    return filter;
  };
};

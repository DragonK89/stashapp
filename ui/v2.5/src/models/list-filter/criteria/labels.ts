import { CriterionModifier } from "src/core/generated-graphql";
import {
  ModifierCriterionOption,
  IHierarchicalLabeledIdCriterion,
} from "./criterion";

const modifierOptions = [
  CriterionModifier.Includes,
  CriterionModifier.IsNull,
  CriterionModifier.NotNull,
];

const defaultModifier = CriterionModifier.Includes;
const inputType = "labels";

export const LabelsCriterionOption = new ModifierCriterionOption({
  messageID: "labels",
  type: "labels",
  modifierOptions,
  defaultModifier,
  inputType,
  makeCriterion: () => new LabelsCriterion(),
});

export class LabelsCriterion extends IHierarchicalLabeledIdCriterion {
  constructor() {
    super(LabelsCriterionOption);
  }
}

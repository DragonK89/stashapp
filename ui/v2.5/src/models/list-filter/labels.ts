import {
  createBooleanCriterionOption,
  createMandatoryNumberCriterionOption,
  createMandatoryStringCriterionOption,
  createStringCriterionOption,
  createMandatoryTimestampCriterionOption,
} from "./criteria/criterion";
import { FavoriteLabelCriterionOption } from "./criteria/favorite";
import { LabelIsMissingCriterionOption } from "./criteria/is-missing";
import { RatingCriterionOption } from "./criteria/rating";
import { StudiosCriterionOption } from "./criteria/studios";
import { TagsCriterionOption } from "./criteria/tags";
import { ListFilterOptions } from "./filter-options";
import { DisplayMode } from "./types";

const defaultSortBy = "name";
const sortByOptions = [
  "name",
  "tag_count",
  "random",
  "rating",
]
  .map(ListFilterOptions.createSortBy)
  .concat([
    {
      messageID: "scene_count",
      value: "scenes_count",
    },
  ]);

const displayModeOptions = [DisplayMode.Grid, DisplayMode.Tagger];
const criterionOptions = [
  FavoriteLabelCriterionOption,
  createMandatoryStringCriterionOption("name"),
  createStringCriterionOption("details"),
  StudiosCriterionOption,
  LabelIsMissingCriterionOption,
  TagsCriterionOption,
  RatingCriterionOption,
  createBooleanCriterionOption("ignore_auto_tag"),
  createMandatoryNumberCriterionOption("tag_count"),
  createMandatoryNumberCriterionOption("scene_count"),
  createStringCriterionOption("url"),
  createStringCriterionOption("aliases"),
  createMandatoryTimestampCriterionOption("created_at"),
  createMandatoryTimestampCriterionOption("updated_at"),
];

export const LabelListFilterOptions = new ListFilterOptions(
  defaultSortBy,
  sortByOptions,
  displayModeOptions,
  criterionOptions
);

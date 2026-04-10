import { GenderEnum, ScraperSourceInput } from "src/core/generated-graphql";

export const STASH_BOX_PREFIX = "stashbox:";
export const SCRAPER_PREFIX = "scraper:";

export interface ITaggerSource {
  id: string;
  sourceInput: ScraperSourceInput;
  displayName: string;
  supportSceneQuery?: boolean;
  supportSceneFragment?: boolean;
  supportGalleryQuery?: boolean;
  supportedURLs?: string[];
}

export const DEFAULT_BLACKLIST = [
  "\\sXXX\\s",
  "1080p",
  "720p",
  "2160p",
  "KTR",
  "RARBG",
  "\\scom\\s",
  "\\[",
  "\\]",
];
export const DEFAULT_EXCLUDED_PERFORMER_FIELDS = ["name"];
export const DEFAULT_EXCLUDED_STUDIO_FIELDS = ["name"];
export const DEFAULT_EXCLUDED_SCENE_FIELDS: string[] = [];
export const DEFAULT_EXCLUDED_GALLERY_FIELDS: string[] = [];

export const initialConfig: ITaggerConfig = {
  blacklist: DEFAULT_BLACKLIST,
  mode: "auto",
  setCoverImage: true,
  setGalleryCoverFromScene: false,
  setTags: true,
  tagOperation: "merge",
  fingerprintQueue: {},
  excludedPerformerFields: DEFAULT_EXCLUDED_PERFORMER_FIELDS,
  performerAliasOperation: "overwrite",
  performerURLsOperation: "overwrite",
  studioAliasOperation: "overwrite",
  studioURLsOperation: "overwrite",
  labelAliasOperation: "overwrite",
  labelURLsOperation: "overwrite",
  markSceneAsOrganizedOnSave: false,
  excludedStudioFields: DEFAULT_EXCLUDED_STUDIO_FIELDS,
  excludedSceneFields: DEFAULT_EXCLUDED_SCENE_FIELDS,
  excludedGalleryFields: DEFAULT_EXCLUDED_GALLERY_FIELDS,
  createParentStudios: true,
};

export type ParseMode =
  | "auto"
  | "filename"
  | "dir"
  | "path"
  | "metadata"
  | "studiocode"
  | "title";
export type TagOperation = "merge" | "overwrite";
export type PerformerFieldOperation = "merge" | "overwrite";
export interface ITaggerConfig {
  blacklist: string[];
  performerGenders?: GenderEnum[];
  mode: ParseMode;
  setCoverImage: boolean;
  setGalleryCoverFromScene: boolean;
  setTags: boolean;
  tagOperation: TagOperation;
  selectedEndpoint?: string;
  fingerprintQueue: Record<string, string[]>;
  excludedPerformerFields?: string[];
  performerAliasOperation?: PerformerFieldOperation;
  performerURLsOperation?: PerformerFieldOperation;
  studioAliasOperation?: PerformerFieldOperation;
  studioURLsOperation?: PerformerFieldOperation;
  labelAliasOperation?: PerformerFieldOperation;
  labelURLsOperation?: PerformerFieldOperation;
  markSceneAsOrganizedOnSave?: boolean;
  excludedStudioFields?: string[];
  excludedSceneFields?: string[];
  excludedGalleryFields?: string[];
  createParentStudios: boolean;
}

export const SCENE_FIELDS = [
  "title",
  "date",
  "url",
  "details",
  "studio",
  "label",
  "galleries",
  "code",
  "director",
  "cover_image",
  "stash_ids",
];

export const GALLERY_FIELDS = [
  "title",
  "date",
  "url",
  "details",
  "studio",
  "performers",
  "tags",
  "code",
  "photographer",
];

export const PERFORMER_FIELDS = [
  "name",
  "image",
  "disambiguation",
  "aliases",
  "gender",
  "birthdate",
  "death_date",
  "country",
  "ethnicity",
  "hair_color",
  "eye_color",
  "height",
  "weight",
  "penis_length",
  "circumcised",
  "measurements",
  "fake_tits",
  "tattoos",
  "piercings",
  "career_length",
  "urls",
  "details",
];

export const STUDIO_FIELDS = ["name", "image", "url", "parent_studio"];

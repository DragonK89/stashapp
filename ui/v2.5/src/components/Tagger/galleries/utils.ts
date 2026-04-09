import * as GQL from "src/core/generated-graphql";
import { ParseMode } from "../constants";

export function prepareQueryString(
  gallery: Partial<GQL.SlimGalleryDataFragment>,
  paths: string[],
  filename: string,
  mode: ParseMode,
  blacklist: string[],
  supportedURLs?: string[]
) {
  // If we have a URL that matches a supported URL of the scraper, use it
  if (supportedURLs && supportedURLs.length > 0 && gallery.urls) {
    for (const url of gallery.urls) {
      for (const supportedURL of supportedURLs) {
        try {
          const gu = new URL(url);
          const su = new URL(supportedURL);
          if (gu.hostname === su.hostname || url.startsWith(supportedURL)) {
            return url;
          }
        } catch {
          if (url.includes(supportedURL) || supportedURL.includes(url)) {
            return url;
          }
        }
      }
    }
    // If we're looking for a matching URL and none is found, return empty string
    return "";
  }

  const regexs = blacklist
    .map((b) => {
      try {
        return new RegExp(b, "gi");
      } catch {
        return null;
      }
    })
    .filter((r) => r !== null) as RegExp[];

  if (mode === "metadata") {
    let str = [
      gallery.date,
      gallery.studio?.name ?? "",
      (gallery?.performers ?? []).map((p) => p.name).join(" "),
      gallery?.title ? gallery.title.replace(/[^a-zA-Z0-9 ]+/g, "") : "",
    ]
      .filter((s) => s !== "")
      .join(" ");
    regexs.forEach((re) => {
      str = str.replace(re, " ");
    });
    return str;
  }
  let s = "";

  if (mode === "auto" || mode === "filename") {
    s = filename;
  } else if (mode === "path") {
    s = [...paths, filename].join(" ");
  } else if (mode === "dir" && paths.length) {
    s = paths[paths.length - 1];
  } else if (mode === "title") {
    s = gallery.title ?? "";
  }

  regexs.forEach((re) => {
    s = s.replace(re, " ");
  });
  return s.replace(/\./g, " ").replace(/ +/g, " ");
}

export function compareGalleriesForSort() {
  // Simple alphabetical sort for now to match interface
  return 0;
}

export function mergeStudioStashIDs(
  existing: GQL.StashId[] | undefined | null,
  endpoint: string,
  remote_id: string
) {
  const ids = (existing ?? []).map((s) => ({
    endpoint: s.endpoint,
    stash_id: s.stash_id,
  }));
  if (!ids.some((s) => s.endpoint === endpoint)) {
    ids.push({ endpoint, stash_id: remote_id });
  }
  return ids;
}

const IMAGE_URL_EXTENSIONS = [
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
];

export function isLikelyImageURL(value: string): boolean {
  const url = value.trim();
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return IMAGE_URL_EXTENSIONS.some((ext) => path.endsWith(ext));
  } catch {
    const path = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
    return IMAGE_URL_EXTENSIONS.some((ext) => path.endsWith(ext));
  }
}

export function extractImageURLs(urls?: string[] | null): string[] {
  if (!urls?.length) {
    return [];
  }

  const seen = new Set<string>();
  const imageURLs: string[] = [];

  for (const rawURL of urls) {
    const url = rawURL.trim();
    if (!url || seen.has(url) || !isLikelyImageURL(url)) {
      continue;
    }

    seen.add(url);
    imageURLs.push(url);
  }

  return imageURLs;
}

export function extractNonImageURLs(urls?: string[] | null): string[] {
  if (!urls?.length) {
    return [];
  }

  const seen = new Set<string>();
  const pageURLs: string[] = [];

  for (const rawURL of urls) {
    const url = rawURL.trim();
    if (!url || seen.has(url) || isLikelyImageURL(url)) {
      continue;
    }

    seen.add(url);
    pageURLs.push(url);
  }

  return pageURLs;
}

import { PerformerFieldOperation } from "../constants";

function cleanStringList(values: Array<string | null | undefined>): string[] {
  const ret: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) {
      return;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    ret.push(trimmed);
  });

  return ret;
}

export function mergeOrOverwriteAliases(options: {
  existingAliases?: string[] | null;
  incomingAliases?: string[] | null;
  finalName: string;
  operation: PerformerFieldOperation;
}): string[] {
  const values =
    options.operation === "merge"
      ? [...(options.existingAliases ?? []), ...(options.incomingAliases ?? [])]
      : [...(options.incomingAliases ?? [])];

  const cleaned = cleanStringList(values);
  const nameKey = options.finalName.trim().toLowerCase();
  if (!nameKey) {
    return cleaned;
  }

  return cleaned.filter((alias) => alias.toLowerCase() !== nameKey);
}

export function mergeOrOverwriteURLs(options: {
  existingURLs?: string[] | null;
  incomingURLs?: string[] | null;
  operation: PerformerFieldOperation;
}): string[] {
  const values =
    options.operation === "merge"
      ? [...(options.existingURLs ?? []), ...(options.incomingURLs ?? [])]
      : [...(options.incomingURLs ?? [])];

  return cleanStringList(values);
}


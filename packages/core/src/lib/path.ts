import type { PathKey } from "../types";

/**
 * Reads the value at `path` from a data tree, e.g. `["lines", 0, "qty"]`.
 * Walking into a nullish value yields `undefined` rather than throwing, so
 * conditions and expressions can reference fields that are not filled in yet.
 */
export function getByPath(data: unknown, path: readonly PathKey[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (current == null) return undefined;
    current = (current as Record<PathKey, unknown>)[key];
  }
  return current;
}

/**
 * Serialises a path into a stable string, so paths (arrays, which compare by
 * identity) can key a `Map`. Every path-keyed lookup shares this one encoding.
 */
export function toPathKey(path: readonly PathKey[]): string {
  return JSON.stringify(path);
}

/** Inverse of {@link toPathKey}. */
export function fromPathKey(key: string): PathKey[] {
  return JSON.parse(key) as PathKey[];
}

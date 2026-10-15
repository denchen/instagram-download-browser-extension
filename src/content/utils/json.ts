// Walking parsed JSON whose shape is not known: GraphQL responses, the blobs
// Instagram embeds in the page, and anything read back out of storage.
//
// Pure on purpose -- no chrome.*, DOM or fetch -- because both sides use it.
//
// These exist so that reaching into an unknown payload is one checked step at
// a time instead of an `any` that silently spreads through everything it
// touches. Narrow what comes back before trusting it.

/** One property of `value`, or undefined if it is not an object. */
export function prop(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** A chain of `prop` steps: `path(json, "data", "user", "username")`. */
export function path(value: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>((current, key) => prop(current, key), value);
}

/** The first value under `key`, however deeply nested. */
export function findKey(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  if (Object.hasOwn(value, key)) return (value as Record<string, unknown>)[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `value` when it is an array, otherwise an empty one, so callers can map. */
export function asArray(value: unknown): unknown[] {
  return isArray(value) ? value : [];
}

/**
 * `Array.isArray` narrows `unknown` to `any[]`, which spreads `any` back into
 * everything downstream. This narrows to `unknown[]` instead.
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

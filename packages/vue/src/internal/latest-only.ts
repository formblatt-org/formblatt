import { toPathKey } from "@formblatt/core";
import type { PathKey } from "@formblatt/core";

/**
 * Latest-wins guard for async work that can be superseded before it settles —
 * a slow options lookup for "US" must not overwrite the choices of a country
 * the user has since changed to "DE". Each `start()` claims a ticket per path
 * and returns a predicate telling its continuation whether it is still newest.
 */
export function createLatestOnly() {
  const tickets = new Map<string, number>();

  const claim = (path: readonly PathKey[]): number => {
    const key = toPathKey(path);
    const ticket = (tickets.get(key) ?? 0) + 1;
    tickets.set(key, ticket);
    return ticket;
  };

  return {
    /** Claims the newest ticket for `path`, invalidating any work already in flight. */
    start(path: readonly PathKey[]): () => boolean {
      const ticket = claim(path);
      return () => tickets.get(toPathKey(path)) === ticket;
    },

    /** Invalidates in-flight work for `path` without starting any of its own. */
    cancel(path: readonly PathKey[]): void {
      claim(path);
    },
  };
}

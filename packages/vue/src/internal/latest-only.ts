import { toPathKey } from "@formblatt/core";
import type { PathKey } from "@formblatt/core";

/** What one {@link createLatestOnly} attempt receives: its currency check and its abort signal. */
export interface Attempt {
  /** Whether this attempt is still the newest for its path. */
  isCurrent(): boolean;
  /** Aborted the moment a newer attempt starts (or `cancel` runs) — pass to fetch. */
  signal: AbortSignal;
}

/**
 * Latest-wins guard for async work that can be superseded before it settles —
 * a slow options lookup for "US" must not overwrite the choices of a country
 * the user has since changed to "DE". Each `start()` claims a ticket per path
 * and hands out an abort signal; starting again aborts the previous attempt's
 * signal, so an in-flight fetch is cancelled rather than left to finish into
 * a dead ticket.
 */
export function createLatestOnly() {
  const tickets = new Map<string, number>();
  const controllers = new Map<string, AbortController>();

  const claim = (key: string): number => {
    const ticket = (tickets.get(key) ?? 0) + 1;
    tickets.set(key, ticket);
    controllers.get(key)?.abort();
    return ticket;
  };

  return {
    /** Claims the newest ticket for `path`, aborting any work already in flight. */
    start(path: readonly PathKey[]): Attempt {
      const key = toPathKey(path);
      const ticket = claim(key);
      const controller = new AbortController();
      controllers.set(key, controller);

      return {
        isCurrent: () => tickets.get(key) === ticket,
        signal: controller.signal,
      };
    },

    /** Invalidates and aborts in-flight work for `path` without starting any of its own. */
    cancel(path: readonly PathKey[]): void {
      const key = toPathKey(path);
      claim(key);
      controllers.delete(key);
    },
  };
}

/**
 * Whether a rejection is the abort WE caused by superseding the attempt —
 * not a failure of the host's resolver, so nothing to report or flag.
 */
export function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

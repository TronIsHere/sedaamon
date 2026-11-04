import { useSyncExternalStore } from "react";

/**
 * Pictures the reader chose to load, by attachment URL, with what to show for each: the URL itself, or the local
 * copy of a picture this tab just sent. Kept outside React so a picture stays loaded when its message scrolls out of
 * the loaded window and back, or the reader switches channels and returns.
 */
const shown = new Map<string, string>();
const listeners = new Set<() => void>();

export function revealMedia(url: string, src = url) {
  if (shown.get(url) === src) return;
  shown.set(url, src);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What to show for this picture once revealed, or undefined while it still waits for a tap. */
export function useRevealed(url: string) {
  return useSyncExternalStore(
    subscribe,
    () => shown.get(url),
    () => undefined,
  );
}

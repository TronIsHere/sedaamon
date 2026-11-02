import { useEffect, useRef, useSyncExternalStore, type TouchEvent } from "react";

// ---------------------------------------------------------------------------
// Back button closes the top overlay (drawer, sheet, dialog) instead of leaving the app.
// Each open overlay adds one history entry; only the top one reacts to "back".

type Overlay = { close: { current: () => void }; popped: boolean };

const overlays: Overlay[] = [];
let ignorePops = 0;
let pendingBack: ReturnType<typeof setTimeout> | undefined;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (ignorePops) {
      ignorePops--;
      return;
    }
    const top = overlays.pop();
    if (top) {
      top.popped = true;
      top.close.current();
    }
  });
}

export function useCloseOnBack(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const overlay: Overlay = { close, popped: false };
    if (pendingBack !== undefined) {
      // An overlay closed a moment ago (or React re-ran this effect): reuse its history entry.
      clearTimeout(pendingBack);
      pendingBack = undefined;
    } else {
      window.history.pushState({ sedaamonOverlay: true }, "");
    }
    overlays.push(overlay);
    return () => {
      const i = overlays.indexOf(overlay);
      if (i >= 0) overlays.splice(i, 1);
      if (overlay.popped) return;
      // Closed from the UI: drop the history entry we added, without closing anything else.
      pendingBack = setTimeout(() => {
        pendingBack = undefined;
        ignorePops++;
        window.history.back();
      }, 0);
    };
  }, [open]);
}

// ---------------------------------------------------------------------------
// Horizontal swipe, reported in logical directions so it follows the page's dir.

export function useSwipe(onSwipe: (toward: "start" | "end") => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      // Text fields move the caret on drag, and the LiveKit grid pages its tiles by swiping.
      const ignore = (e.target as Element).closest("input, textarea, [data-lk-theme]");
      const t = e.touches[0];
      start.current = e.touches.length === 1 && !ignore ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2 || e.timeStamp - s.t > 600) return;
      // A sheet nested inside a swipeable area handles its own swipe; don't let the parent open something too.
      e.stopPropagation();
      // In RTL the inline start is on the right, so a finger moving right moves toward the start.
      const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
      onSwipe(dx > 0 === rtl ? "start" : "end");
    },
  };
}

export const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;

// ---------------------------------------------------------------------------
// "Install app": Chrome/Edge/Samsung fire beforeinstallprompt; iOS Safari only installs from the share sheet.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const emitInstall = () => installListeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emitInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitInstall();
  });
}

const subscribeInstall = (l: () => void) => {
  installListeners.add(l);
  return () => installListeners.delete(l);
};

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const needsManualIosInstall = () =>
  !isStandalone() &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribeInstall, () => deferredPrompt !== null, () => false);
  const iosManual = useSyncExternalStore(subscribeInstall, needsManualIosInstall, () => false);
  const install = async () => {
    const e = deferredPrompt;
    if (!e) return;
    deferredPrompt = null;
    emitInstall();
    await e.prompt();
  };
  return { canPrompt, iosManual, install };
}

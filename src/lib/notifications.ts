"use client";

import { useCallback, useEffect, useState } from "react";
import { desktopNotify, isDesktopApp, onDesktopEvent } from "./desktop";

const KEY = "sedaamon:notifications";

const supported = () => typeof window !== "undefined" && "Notification" in window;

/** The desktop app shows native notifications without asking; the WebView's own are unreliable there. */
const permitted = () => isDesktopApp() || (supported() && Notification.permission === "granted");

function readPref() {
  try {
    const pref = localStorage.getItem(KEY);
    // The desktop app starts with notifications on; a browser waits until they are turned on.
    return pref === "on" || (pref === null && isDesktopApp());
  } catch {
    return false;
  }
}

/** Whether to show system notifications for new messages while the app is in the background (per device). */
export function useNotificationPref() {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    // Browser-only state; read it after hydration so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailable(isDesktopApp() || supported());
    setEnabled(permitted() && readPref());
  }, []);

  const toggle = useCallback(async () => {
    if (!isDesktopApp() && !supported()) return false;
    let next = !enabled;
    if (next && !permitted()) next = (await Notification.requestPermission()) === "granted";
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {}
    setEnabled(next);
    return next;
  }, [enabled]);

  return { enabled, available, toggle };
}

/** What to do when a desktop notification is clicked, by tag. Only the latest few are kept. */
const clickHandlers = new Map<string, () => void>();

if (typeof window !== "undefined" && isDesktopApp()) {
  onDesktopEvent((e) => {
    if (e.type !== "notification") return;
    clickHandlers.get(e.tag)?.();
    clickHandlers.delete(e.tag);
  });
}

/**
 * Shows a system notification; Android Chrome only allows them through the service worker. In the desktop app it is a
 * native one, and clicking it runs `onClick`.
 */
export async function showNotification(title: string, body: string, tag: string, onClick?: () => void) {
  if (!permitted() || !readPref()) return;
  if (isDesktopApp()) {
    if (onClick) {
      clickHandlers.delete(tag);
      clickHandlers.set(tag, onClick);
      if (clickHandlers.size > 50) clickHandlers.delete(clickHandlers.keys().next().value!);
    }
    return desktopNotify(title, body, tag);
  }
  const options: NotificationOptions = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, options);
    new Notification(title, options);
  } catch {}
}

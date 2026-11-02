"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "sedaamon:notifications";

const supported = () => typeof window !== "undefined" && "Notification" in window;

function readPref() {
  try {
    return localStorage.getItem(KEY) === "on";
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
    setAvailable(supported());
    setEnabled(supported() && Notification.permission === "granted" && readPref());
  }, []);

  const toggle = useCallback(async () => {
    if (!supported()) return false;
    let next = !enabled;
    if (next && Notification.permission !== "granted") next = (await Notification.requestPermission()) === "granted";
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {}
    setEnabled(next);
    return next;
  }, [enabled]);

  return { enabled, available, toggle };
}

/** Shows a system notification; Android Chrome only allows them through the service worker. */
export async function showNotification(title: string, body: string, tag: string) {
  if (!supported() || Notification.permission !== "granted" || !readPref()) return;
  const options: NotificationOptions = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, options);
    new Notification(title, options);
  } catch {}
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { effectiveNotify, type NotifySettings } from "@/lib/notify";
import { getSocket } from "@/lib/socket";
import type { NotifyLevel, NotifySettingDTO } from "@/lib/types";

/** A change to one place's notifications: the level (null on a channel follows the server) and/or the mute. */
export interface NotifyChange {
  level?: NotifyLevel | null;
  /** Minutes, "forever", or false to unmute. */
  mute?: number | "forever" | false;
}

/** Your mute and "mentions only" choices, kept on the server and in step across your devices. */
export function useNotifySettings() {
  const [settings, setSettings] = useState<NotifySettings>({});

  const put = useCallback((target: string, setting: NotifySettingDTO | null) => {
    setSettings((s) => {
      const next = { ...s };
      if (setting) next[target] = setting;
      else delete next[target];
      return next;
    });
  }, []);

  useEffect(() => {
    const load = () =>
      api<{ settings: NotifySettingDTO[] }>("/api/me/notify-settings")
        .then((res) => setSettings(Object.fromEntries(res.settings.map((s) => [s.target, s]))))
        .catch(() => {});
    load();
    const socket = getSocket();
    let connectedOnce = socket.connected;
    const onConnect = () => {
      if (connectedOnce) load();
      connectedOnce = true;
    };
    const onUpdate = ({ target, setting }: { target: string; setting: NotifySettingDTO | null }) => put(target, setting);
    socket.on("connect", onConnect);
    socket.on("notify:update", onUpdate);
    return () => {
      socket.off("connect", onConnect);
      socket.off("notify:update", onUpdate);
    };
  }, [put]);

  const change = useCallback(
    async (target: string, scope: NotifySettingDTO["scope"], patch: NotifyChange) => {
      const { setting } = await api<{ setting: NotifySettingDTO | null }>("/api/me/notify-settings", { method: "PUT", body: { target, scope, ...patch } });
      put(target, setting);
    },
    [put],
  );

  /** What applies to a channel; `serverId` is null for a direct conversation. */
  const effective = useCallback((channelId: string, serverId: string | null) => effectiveNotify(settings, channelId, serverId), [settings]);

  return { settings, change, effective };
}

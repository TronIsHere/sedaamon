"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { LiveMessageDTO, ReadEvent, ReadStateDTO } from "@/lib/types";

/** channelId → how far it has been read and how many messages from others came after that (pings are counted apart). */
export type Unread = Record<string, { serverId: string; count: number; lastRead: string | null; /** Of those, how many ping me. */ mentions: number }>;

/** Ids are ObjectIds, whose hex text sorts in the order they were made. */
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** How long reading a busy channel waits before telling the server, so a burst of messages is one request. */
const MARK_DELAY_MS = 1200;

/**
 * Read markers kept on the server, so badges survive a reload and agree across devices. Messages that arrive while a
 * channel is off screen count up here; opening it (or reading it on another device) clears it.
 */
export function useReadState({ meId, onRead }: { meId: string; /** Reads made here or on another device, to take their pings off the list. */ onRead: (reads: ReadEvent["reads"]) => void }) {
  const [unread, setUnread] = useState<Unread>({});
  const unreadRef = useRef(unread);
  const onReadRef = useRef(onRead);
  /** Channels that got a message since they were last marked, so opening a quiet one needs no request. */
  const dirty = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    unreadRef.current = unread;
    onReadRef.current = onRead;
  });

  const applyReads = useCallback((reads: ReadEvent["reads"]) => {
    setUnread((u) => {
      const next = { ...u };
      for (const r of reads) {
        const entry = next[r.channelId];
        if (entry) next[r.channelId] = { ...entry, count: 0, lastRead: later(entry.lastRead, r.lastRead) };
      }
      return next;
    });
    onReadRef.current(reads);
  }, []);

  const load = useCallback(
    () =>
      api<{ reads: ReadStateDTO[] }>("/api/me/reads")
        .then((res) => {
          const next: Unread = {};
          for (const r of res.reads) next[r.channelId] = { serverId: r.serverId, count: r.count, lastRead: r.lastRead, mentions: 0 };
          // Messages counted live between the request and now would be lost; keep whichever count is higher.
          setUnread((u) => {
            for (const [id, live] of Object.entries(u)) if (next[id] && live.count > next[id].count) next[id] = { ...next[id], count: live.count };
            return next;
          });
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    load();
    const socket = getSocket();
    let connectedOnce = socket.connected;
    // After a reconnect messages may have come and gone unseen.
    const onConnect = () => {
      if (connectedOnce) load();
      connectedOnce = true;
    };
    const onReadEvent = ({ reads }: ReadEvent) => applyReads(reads);
    socket.on("connect", onConnect);
    socket.on("read:update", onReadEvent);
    return () => {
      socket.off("connect", onConnect);
      socket.off("read:update", onReadEvent);
    };
  }, [load, applyReads]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) window.clearTimeout(t);
    };
  }, []);

  /** Records a message as it arrives; `onScreen` means it is being read right now. */
  const countMessage = useCallback((m: LiveMessageDTO, onScreen: boolean) => {
    dirty.current.add(m.channelId);
    // Writing in a channel means having read it, here and on every other device.
    if (onScreen || m.author.id === meId) return;
    setUnread((u) => {
      const entry = u[m.channelId] ?? { serverId: m.serverId, count: 0, lastRead: null, mentions: 0 };
      return { ...u, [m.channelId]: { ...entry, count: entry.count + 1 } };
    });
  }, [meId]);

  /** Tells the server this channel is read up to its newest message. Repeated calls within a moment are folded into one. */
  const markRead = useCallback((channelId: string) => {
    const entry = unreadRef.current[channelId];
    if (!dirty.current.has(channelId) && !entry?.count) return;
    if (entry?.count) setUnread((u) => (u[channelId] ? { ...u, [channelId]: { ...u[channelId], count: 0 } } : u));
    if (timers.current.has(channelId)) return;
    const send = () => {
      timers.current.delete(channelId);
      dirty.current.delete(channelId);
      api<{ lastRead: string | null }>(`/api/channels/${channelId}/read`, { method: "PUT", body: {} })
        .then(({ lastRead }) => lastRead && applyReads([{ channelId, lastRead }]))
        .catch(() => dirty.current.add(channelId));
    };
    // Opening a channel with unread messages tells the server at once; messages read as they arrive wait to share a request.
    timers.current.set(channelId, window.setTimeout(send, entry?.count ? 0 : MARK_DELAY_MS));
  }, [applyReads]);

  /** "Mark server as read". */
  const markServerRead = useCallback(
    async (serverId: string) => {
      setUnread((u) => Object.fromEntries(Object.entries(u).map(([id, v]) => [id, v.serverId === serverId ? { ...v, count: 0 } : v])));
      const { reads } = await api<ReadEvent>(`/api/servers/${serverId}/read`, { body: {} });
      applyReads(reads);
    },
    [applyReads],
  );

  /** Forgets a server the person is no longer in. */
  const dropServer = useCallback((serverId: string) => setUnread((u) => Object.fromEntries(Object.entries(u).filter(([, v]) => v.serverId !== serverId))), []);

  return { unread, countMessage, markRead, markServerRead, dropServer, reload: load };
}

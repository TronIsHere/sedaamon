"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { ArrowUp, AtSign, BellOff, ChevronDown, CornerUpLeft, Paperclip, ScrollText, SearchX, SendHorizontal, Sticker as StickerIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import { IMAGE_TYPES, MAX_ATTACHMENTS, MAX_FILE_BYTES, messageSummary } from "@/lib/attachments";
import { cn, formatDateTime, formatDay, sameDay } from "@/lib/format";
import { prepareImage } from "@/lib/image";
import { revealMedia } from "@/lib/media";
import { EVERYONE, hasMention, pingsUser } from "@/lib/mentions";
import { isTouchDevice } from "@/lib/mobile";
import { can, canViewChannel, isMuted, msUntil, NO_STANDING, outranks, standingOf } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import { foldForSearch, matchesSearch } from "@/lib/search";
import { getSocket } from "@/lib/socket";
import type { VoiceNote } from "@/lib/recorder";
import { uploadFile } from "@/lib/upload";
import {
  UNREAD_CAP,
  type ChannelDTO,
  type LiveMessageDTO,
  type MeDTO,
  type MemberDTO,
  type MessageDeletedEvent,
  type MessageDTO,
  type ReactionsEvent,
  type RoleDTO,
  type TypingEvent,
  type UserDTO,
} from "@/lib/types";
import Avatar from "./Avatar";
import { MessagesSkeleton, PageEdge, PendingFiles, PinList, TypingLine, type PendingFile } from "./ChatParts";
import { Modal } from "./Dialogs";
import ForwardDialog from "./ForwardDialog";
import MessageItem, { type MessageActions } from "./MessageItem";
import { StickerPicker } from "./Stickers";
import { RecordingBar, useCanRecordVoice, VoiceRecordButton, type RecordingState } from "./VoiceNote";

const GROUP_WINDOW_MS = 5 * 60_000;
/** How often we tell others we're typing, and how long their indicator lasts without a new signal. */
const TYPING_SEND_MS = 2500;
const TYPING_SHOW_MS = 4000;
/**
 * The most messages kept in memory (and in the DOM) at once. Scrolling far in one direction drops the far end, which
 * is loaded again when the reader comes back, so a channel's length never decides how heavy the page is.
 */
const MAX_LOADED = 200;
/** How far before an edge of the list the next page starts loading. */
const LOAD_MARGIN = "600px 0px";
/** Within this many pixels of the bottom the view follows new messages. */
const BOTTOM_SLACK = 80;

interface MessagePage {
  messages: MessageDTO[];
  /** Older messages exist beyond this page. */
  hasMore: boolean;
  /** Newer messages exist beyond this page; absent when the request says nothing about it. */
  hasNewer?: boolean;
}

function addUnique(list: MessageDTO[], incoming: MessageDTO[]) {
  const seen = new Set(list.map((m) => m.id));
  return [...list, ...incoming.filter((m) => !seen.has(m.id))];
}

/** The pin list with `m` added, updated or removed, newest pin first. */
function withPin(pins: MessageDTO[], m: MessageDTO) {
  const rest = pins.filter((p) => p.id !== m.id);
  return m.pinnedAt ? [m, ...rest].sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!)) : rest;
}

/**
 * The first message from someone else since reading stopped: the first after `lastRead`, or without a marker the
 * `count`-th from the end. Null when it isn't among `messages`. `complete` says nothing older than these can be new
 * (the page reaches back to the marker, or to the start of the channel).
 */
function firstNew(messages: MessageDTO[], since: { lastRead: string | null; count: number }, meId: string, complete: boolean) {
  const others = messages.filter((m) => m.author.id !== meId);
  if (since.lastRead) {
    const reachesBack = complete || (!!messages[0] && messages[0].id <= since.lastRead);
    return (reachesBack && others.find((m) => m.id > since.lastRead!)?.id) || null;
  }
  // Counts stop at the cap, so a capped count can't place the line.
  const at = others.length - since.count;
  return since.count < UNREAD_CAP && at >= 0 ? others[at].id : null;
}

const REPLY_PREVIEW_LENGTH = 120;
const MENU_SIZE = 6;

/** One row of the "@" menu: a member, or everyone at once. */
type Candidate = { kind: "user"; user: UserDTO } | { kind: "everyone" };

export default function ChatView({
  me,
  channel,
  search,
  members,
  roles,
  online,
  dm,
  rulesPending,
  unreadFrom,
  onOpenProfile,
  onOpenWelcome,
  onNotify,
}: {
  me: MeDTO;
  channel: ChannelDTO;
  /** The other person, when this is a direct conversation. */
  dm?: UserDTO;
  search: string;
  members: MemberDTO[];
  /** The server's roles, strongest first; empty in a direct conversation. */
  roles: RoleDTO[];
  online: Record<string, boolean>;
  /** The server's rules haven't been accepted yet, so writing is closed. */
  rulesPending: boolean;
  /** Where reading stopped when the channel was opened, if messages came after; read only on mount. */
  unreadFrom: { lastRead: string | null; count: number } | null;
  onOpenProfile: (userId: string) => void;
  /** Reopens the welcome screen with the rules. */
  onOpenWelcome: () => void;
  onNotify: (message: string) => void;
}) {
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  /** Every pinned message of the channel, including ones older than what is loaded. */
  const [pins, setPins] = useState<MessageDTO[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  /** The loaded messages stop short of the newest one, so live messages are not added until the reader returns. */
  const [hasNewer, setHasNewer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<"older" | "newer" | null>(null);
  /** A page failed to load; paging stops until the reader retries, instead of asking again in a loop. */
  const [loadFailed, setLoadFailed] = useState<"older" | "newer" | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [typing, setTyping] = useState<Record<string, { user: UserDTO; until: number }>>({});
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const pendingRef = useRef<PendingFile[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canRecord = useCanRecordVoice();
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const closeStickers = useCallback(() => setStickersOpen(false), []);
  const [selected, setSelected] = useState<{ id: string; picking: boolean } | null>(null);
  const [deleting, setDeleting] = useState<MessageDTO | null>(null);
  const [forwarding, setForwarding] = useState<MessageDTO | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [, expireMute] = useState(0);
  const [caret, setCaret] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  /** Where the "@" menu was closed with Esc, so it stays closed for that word. */
  const [menuClosedAt, setMenuClosedAt] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);
  /** userId → name of everyone picked from the "@" menu in this chat; only those still written in the text are sent as pings. */
  const picked = useRef(new Map<string, string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<MessageDTO[]>([]);
  const hasNewerRef = useRef(false);
  /** One page request at a time; `epoch` changes when the window is replaced so a late page is dropped. */
  const busy = useRef(false);
  const epoch = useRef(0);
  const stickToBottom = useRef(true);
  /** The message that must stay where it is on screen when the list changes above or below it. */
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const pendingJump = useRef<string | null>(null);
  /** What was new when the channel opened. The channel is marked read right away, so this is kept from the first render. */
  const [newSince] = useState(unreadFrom);
  /** The first of those messages, once it is known; the "new messages" line goes above it. */
  const [firstNewId, setFirstNewId] = useState<string | null>(null);
  const [newBarOpen, setNewBarOpen] = useState(!!unreadFrom);

  const q = foldForSearch(search);
  const memberById = useMemo(() => new Map(members.map((m) => [m.user.id, m])), [members]);
  const myMember = memberById.get(me.id);
  const myStanding = useMemo(() => (myMember ? standingOf(myMember, roles) : NO_STANDING), [myMember, roles]);
  const muted = isMuted(myMember?.mutedUntil) || rulesPending;

  // "@" followed by letters right before the cursor opens the member menu (not in direct messages, where there is nobody to ping).
  const word = dm || muted ? null : /(^|[\s(])@([^\s@]*)$/u.exec(draft.slice(0, caret));
  const wordStart = word ? caret - word[2].length - 1 : -1;
  const candidates: Candidate[] = useMemo(() => {
    if (!word || wordStart === menuClosedAt) return [];
    const q = foldForSearch(word[2]);
    const people = members
      .filter((m) => m.user.id !== me.id && canViewChannel(channel, standingOf(m, roles), m.user.id) && matchesSearch(m.user.name, q))
      .sort((a, b) => Number(foldForSearch(b.user.name).startsWith(q)) - Number(foldForSearch(a.user.name).startsWith(q)))
      .map((m): Candidate => ({ kind: "user", user: m.user }));
    const everyone: Candidate[] = can(myStanding, "message:mention_everyone") && EVERYONE.startsWith(q) ? [{ kind: "everyone" }] : [];
    return [...everyone, ...people].slice(0, MENU_SIZE);
    // `word` is derived from draft and caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, caret, members, roles, channel, me.id, myStanding, menuClosedAt]);
  const activeCandidate = Math.min(menuIndex, candidates.length - 1);

  // The composer unlocks by itself when the mute runs out.
  useEffect(() => {
    if (!myMember?.mutedUntil) return;
    const left = msUntil(myMember.mutedUntil);
    if (left <= 0) return;
    const timer = window.setTimeout(() => expireMute((n) => n + 1), Math.min(left + 250, 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [myMember?.mutedUntil]);

  useEffect(() => {
    let cancelled = false;
    api<{ messages: MessageDTO[]; hasMore: boolean }>(`/api/channels/${channel.id}/messages`)
      .then((res) => {
        if (cancelled) return;
        setMessages((live) => addUnique(res.messages, live));
        setHasMore(res.hasMore);
        if (newSince) setFirstNewId(firstNew(res.messages, newSince, me.id, !res.hasMore));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    api<{ messages: MessageDTO[] }>(`/api/channels/${channel.id}/pins`)
      .then((res) => !cancelled && setPins((live) => res.messages.reduce(withPin, live)))
      .catch(() => {});

    const socket = getSocket();
    const onMessage = (m: MessageDTO) => {
      if (m.channelId !== channel.id) return;
      // Away from the newest messages, appending would leave a gap; returning to the bottom loads them.
      if (!hasNewerRef.current) setMessages((list) => addUnique(list, [m]));
      setTyping((t) => {
        if (!t[m.author.id]) return t;
        const rest = { ...t };
        delete rest[m.author.id];
        return rest;
      });
    };
    const onEdit = (m: LiveMessageDTO) => {
      if (m.channelId !== channel.id) return;
      setMessages((list) =>
        list.map((x) => {
          if (x.id === m.id) return m;
          // Replies quote the original, so keep their preview in step.
          return x.replyTo?.id === m.id && !x.replyTo.deleted
            ? { ...x, replyTo: { ...x.replyTo, content: messageSummary(m.content, m.attachments).slice(0, REPLY_PREVIEW_LENGTH) } }
            : x;
        }),
      );
      setReplyTo((r) => (r?.id === m.id ? m : r));
      setPins((list) => list.map((x) => (x.id === m.id ? m : x)));
    };
    const onPin = (m: LiveMessageDTO) => {
      if (m.channelId !== channel.id) return;
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, pinnedAt: m.pinnedAt } : x)));
      setPins((list) => withPin(list, m));
    };
    const onDelete = ({ channelId, messageId }: MessageDeletedEvent) => {
      if (channelId !== channel.id) return;
      setMessages((list) =>
        list
          .filter((x) => x.id !== messageId)
          .map((x) =>
            x.replyTo?.id === messageId ? { ...x, replyTo: { id: messageId, deleted: true, content: "", author: null } } : x,
          ),
      );
      setReplyTo((r) => (r?.id === messageId ? null : r));
      setPins((list) => list.filter((x) => x.id !== messageId));
      setSelected((sel) => (sel?.id === messageId ? null : sel));
    };
    const onReactions = ({ channelId, messageId, reactions }: ReactionsEvent) => {
      if (channelId !== channel.id) return;
      setMessages((list) => list.map((x) => (x.id === messageId ? { ...x, reactions } : x)));
    };
    const onTyping = ({ channelId, user }: TypingEvent) => {
      if (channelId === channel.id && user.id !== me.id)
        setTyping((t) => ({ ...t, [user.id]: { user, until: Date.now() + TYPING_SHOW_MS } }));
    };
    // Replies and authors quote people as they were; refresh them when a name or picture changes.
    const onUserUpdate = (u: UserDTO) => {
      setMessages((list) =>
        list.some((x) => x.author.id === u.id || x.replyTo?.author?.id === u.id)
          ? list.map((x) => ({
              ...x,
              author: x.author.id === u.id ? u : x.author,
              replyTo: x.replyTo?.author?.id === u.id ? { ...x.replyTo, author: u } : x.replyTo,
            }))
          : list,
      );
      setPins((list) => (list.some((x) => x.author.id === u.id) ? list.map((x) => (x.author.id === u.id ? { ...x, author: u } : x)) : list));
    };
    socket.on("user:update", onUserUpdate);
    socket.on("message:new", onMessage);
    socket.on("message:edit", onEdit);
    socket.on("message:pin", onPin);
    socket.on("message:delete", onDelete);
    socket.on("message:reactions", onReactions);
    socket.on("typing", onTyping);
    return () => {
      cancelled = true;
      socket.off("user:update", onUserUpdate);
      socket.off("message:new", onMessage);
      socket.off("message:edit", onEdit);
      socket.off("message:pin", onPin);
      socket.off("message:delete", onDelete);
      socket.off("message:reactions", onReactions);
      socket.off("typing", onTyping);
    };
    // `newSince` never changes after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, me.id]);

  // Drop typing indicators whose sender went quiet.
  const anyTyping = Object.keys(typing).length > 0;
  useEffect(() => {
    if (!anyTyping) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTyping((t) => {
        const live = Object.entries(t).filter(([, v]) => v.until > now);
        return live.length === Object.keys(t).length ? t : Object.fromEntries(live);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [anyTyping]);

  const setNewer = useCallback((value: boolean) => {
    hasNewerRef.current = value;
    setHasNewer(value);
  }, []);

  /** Remembers the first message on screen and where it sits, so it can be put back after the list changes. */
  const captureAnchor = () => {
    const box = scrollRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top;
    for (const row of box.querySelectorAll<HTMLElement>("[data-mid]")) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom > top) {
        anchor.current = { id: row.dataset.mid!, offset: rect.top - top };
        return;
      }
    }
  };

  const flash = (id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((current) => (current === id ? null : current)), 1400);
  };

  /** Loads the page next to the oldest or newest loaded message, and drops the far end beyond MAX_LOADED. */
  const loadMore = useCallback(
    async (dir: "older" | "newer") => {
      const loaded = messagesRef.current;
      if (busy.current || !loaded.length) return;
      busy.current = true;
      const mine = epoch.current;
      setLoadFailed(null);
      setLoadingMore(dir);
      try {
        const cursor = dir === "older" ? `before=${loaded[0].id}` : `after=${loaded[loaded.length - 1].id}`;
        const res = await api<MessagePage>(`/api/channels/${channel.id}/messages?${cursor}`);
        if (mine !== epoch.current) return;
        captureAnchor();
        const current = messagesRef.current;
        if (dir === "older") {
          const merged = addUnique(res.messages, current);
          const grew = merged.length > current.length;
          const trimmed = merged.length > MAX_LOADED;
          setMessages(trimmed ? merged.slice(0, MAX_LOADED) : merged);
          setHasMore(grew && res.hasMore);
          if (trimmed) setNewer(true);
        } else {
          const merged = addUnique(current, res.messages);
          const grew = merged.length > current.length;
          const trimmed = merged.length > MAX_LOADED;
          setMessages(trimmed ? merged.slice(-MAX_LOADED) : merged);
          setNewer(grew && !!res.hasNewer);
          if (trimmed) setHasMore(true);
        }
      } catch (err) {
        setLoadFailed(dir);
        setError((err as Error).message);
      } finally {
        if (mine === epoch.current) {
          busy.current = false;
          setLoadingMore(null);
        }
      }
    },
    [channel.id, setNewer],
  );

  /** Replaces the loaded window with another page; whatever was loading is abandoned. */
  const replaceWindow = async (query: string, prepare: (page: MessagePage) => void) => {
    const mine = ++epoch.current;
    busy.current = true;
    setLoadFailed(null);
    setLoadingMore(null);
    try {
      const res = await api<MessagePage>(`/api/channels/${channel.id}/messages${query}`);
      if (mine !== epoch.current) return;
      prepare(res);
      anchor.current = null;
      setMessages(res.messages);
      setHasMore(res.hasMore);
      setNewer(!!res.hasNewer);
    } catch (err) {
      pendingJump.current = null;
      setError((err as Error).message);
    } finally {
      if (mine === epoch.current) busy.current = false;
    }
  };

  const scrollToBottom = () => {
    const box = scrollRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  };

  /** To the first new message, loading the stretch that starts there when it is further back than what is loaded. */
  const jumpToNew = () => {
    setNewBarOpen(false);
    const loaded = firstNewId && document.getElementById(`msg-${firstNewId}`);
    if (loaded) return loaded.scrollIntoView({ block: "center", behavior: "smooth" });
    const lastRead = newSince?.lastRead;
    if (!lastRead) return;
    replaceWindow(`?after=${lastRead}`, (page) => {
      stickToBottom.current = false;
      const first = firstNew(page.messages, { lastRead, count: 0 }, me.id, true);
      setFirstNewId(first);
      pendingJump.current = first;
    });
  };

  // The bar about new messages goes away once their line has been on screen.
  const dividerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const line = dividerRef.current;
    const box = scrollRef.current;
    if (!line || !box || !newBarOpen) return;
    const observer = new IntersectionObserver(([e]) => e.isIntersecting && setNewBarOpen(false), { root: box });
    observer.observe(line);
    return () => observer.disconnect();
  }, [firstNewId, newBarOpen, messages.length]);

  /** Back to the newest messages, reloading them first when the loaded window ended earlier. */
  const jumpToLatest = () => {
    if (!hasNewerRef.current) return scrollToBottom();
    replaceWindow("", () => {
      stickToBottom.current = true;
      setAtBottom(true);
    });
  };

  const onScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    const bottom = box.scrollHeight - box.scrollTop - box.clientHeight < BOTTOM_SLACK && !hasNewerRef.current;
    stickToBottom.current = bottom;
    setAtBottom(bottom);
  };

  // Keep what the reader is looking at in place: a new page changes the list above or below the view.
  useLayoutEffect(() => {
    messagesRef.current = messages;
    const box = scrollRef.current;
    if (!box) return;
    const jumpTo = pendingJump.current;
    pendingJump.current = null;
    if (jumpTo) {
      const target = document.getElementById(`msg-${jumpTo}`);
      if (target) {
        anchor.current = null;
        target.scrollIntoView({ block: "center" });
        return;
      }
    }
    const pinned = anchor.current;
    anchor.current = null;
    if (pinned) {
      const row = box.querySelector<HTMLElement>(`[data-mid="${pinned.id}"]`);
      if (row) box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - pinned.offset;
    } else if (stickToBottom.current) {
      box.scrollTop = box.scrollHeight;
    }
  }, [messages]);

  // Load the next page as either end of the list comes within reach.
  useEffect(() => {
    const box = scrollRef.current;
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (!box || !top || !bottom || loading || q || loadingMore || loadFailed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === top && hasMore) loadMore("older");
          else if (e.target === bottom && hasNewer) loadMore("newer");
        }
      },
      { root: box, rootMargin: LOAD_MARGIN },
    );
    observer.observe(top);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, [loading, q, loadingMore, loadFailed, hasMore, hasNewer, messages.length, loadMore]);

  /** Shows a message just sent by this user, taking the view to the bottom where it lands. */
  const addSent = (message: MessageDTO) => {
    if (hasNewerRef.current) return jumpToLatest();
    stickToBottom.current = true;
    setMessages((list) => addUnique(list, [message]));
  };

  const uploading = pending.some((f) => !f.id);
  const canSend = (!!draft.trim() || pending.length > 0) && !uploading;

  const send = async () => {
    const content = draft.trim();
    const files = pending;
    if (!canSend) return;
    if (muted) return;
    setError(undefined);
    lastTypingSent.current = 0;
    const replying = replyTo;
    // Clear right away so the user can keep typing; put the text back if sending fails.
    setDraft("");
    setReplyTo(null);
    setPending([]);
    try {
      const res = await api<{ message: MessageDTO }>(`/api/channels/${channel.id}/messages`, {
        body: {
          content,
          replyTo: replying?.id,
          mentions: [...picked.current].filter(([, name]) => hasMention(content, name)).map(([id]) => id),
          attachments: files.map((f) => f.id),
        },
      });
      // The sender's own pictures show at once, from the copy already on this device.
      res.message.attachments.forEach((a, i) => {
        const local = files[i]?.localUrl;
        if (a.kind === "image" && local) revealMedia(a.url, local);
      });
      addSent(res.message);
    } catch (err) {
      setError((err as Error).message);
      setDraft((current) => current || content);
      setReplyTo((current) => current ?? replying);
      setPending((current) => (current.length ? current : files));
    } finally {
      inputRef.current?.focus();
    }
  };

  /** Uploads a just-recorded voice note and sends it on its own, as a reply if one was being written. */
  const sendVoiceNote = async (note: VoiceNote) => {
    if (muted) return;
    if (note.blob.size > MAX_FILE_BYTES) return setError("پیام صوتی بیشتر از ۵ مگابایت است");
    setError(undefined);
    setSendingVoice(true);
    const replying = replyTo;
    setReplyTo(null);
    try {
      const fields = { kind: "voice", duration: note.seconds.toFixed(1), waveform: note.waveform.join(",") };
      const { id } = await uploadFile(channel.id, { blob: note.blob, name: note.name, fields }, () => {});
      const res = await api<{ message: MessageDTO }>(`/api/channels/${channel.id}/messages`, {
        body: { attachments: [id], replyTo: replying?.id },
      });
      // The sender plays their own note from the recording still in memory.
      const sent = res.message.attachments[0];
      if (sent) revealMedia(sent.url, URL.createObjectURL(note.blob));
      addSent(res.message);
    } catch (err) {
      setError((err as Error).message);
      setReplyTo((current) => current ?? replying);
    } finally {
      setSendingVoice(false);
    }
  };

  const updatePending = (key: string, change: Partial<PendingFile>) =>
    setPending((list) => list.map((f) => (f.key === key ? { ...f, ...change } : f)));

  /** Shrinks pictures, checks sizes and starts uploading each file; problems show above the composer. */
  const addFiles = async (picked: File[]) => {
    if (muted || !picked.length) return;
    setError(undefined);
    const room = MAX_ATTACHMENTS - pendingRef.current.length;
    if (picked.length > room) setError(`هر پیام حداکثر ${toPersianDigits(MAX_ATTACHMENTS)} پیوست دارد`);
    for (const file of picked.slice(0, Math.max(0, room))) {
      const image = (IMAGE_TYPES as readonly string[]).includes(file.type) ? await prepareImage(file) : null;
      const blob = image?.blob ?? file;
      const name = image?.name ?? file.name;
      if (blob.size > MAX_FILE_BYTES) {
        setError(`«${name}» بیشتر از ۵ مگابایت است`);
        continue;
      }
      const entry: PendingFile = {
        key: crypto.randomUUID(),
        name,
        size: blob.size,
        kind: image ? "image" : "file",
        localUrl: image ? URL.createObjectURL(blob) : undefined,
        progress: 0,
        abort: new AbortController(),
      };
      setPending((list) => [...list, entry]);
      const fields = { width: image?.width, height: image?.height, preview: image?.preview };
      uploadFile(channel.id, { blob, name, fields }, (progress) => updatePending(entry.key, { progress }), entry.abort.signal)
        .then(({ id }) => updatePending(entry.key, { id, progress: 1 }))
        .catch((err: Error) => err.name !== "AbortError" && updatePending(entry.key, { error: err.message }));
    }
  };

  const removePending = (f: PendingFile) => {
    f.abort.abort();
    if (f.localUrl) URL.revokeObjectURL(f.localUrl);
    setPending((list) => list.filter((x) => x.key !== f.key));
    // Already on the server: take it back now rather than leaving it for the sweeper.
    if (f.id) void api(`/api/channels/${channel.id}/files/${f.id}`, { method: "DELETE" }).catch(() => {});
  };

  // Leaving the channel stops unfinished uploads; finished ones are swept from the server after a day.
  useEffect(
    () => () => {
      for (const f of pendingRef.current) {
        f.abort.abort();
        if (f.localUrl) URL.revokeObjectURL(f.localUrl);
      }
    },
    [],
  );

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (!files.length) return;
    e.preventDefault();
    void addFiles(files);
  };

  const canAttach = !muted;
  const onDragOver = (e: DragEvent) => {
    if (!canAttach || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    if (!canAttach || !e.dataTransfer.files.length) return;
    e.preventDefault();
    setDragging(false);
    void addFiles([...e.dataTransfer.files]);
  };

  const sendSticker = async (sticker: string) => {
    if (muted) return;
    setError(undefined);
    setStickersOpen(false);
    const replying = replyTo;
    setReplyTo(null);
    try {
      const res = await api<{ message: MessageDTO }>(`/api/channels/${channel.id}/messages`, {
        body: { sticker, replyTo: replying?.id },
      });
      addSent(res.message);
    } catch (err) {
      setError((err as Error).message);
      setReplyTo((current) => current ?? replying);
    }
  };

  const pickCandidate = (c: Candidate) => {
    const name = c.kind === "everyone" ? EVERYONE : c.user.name;
    if (c.kind === "user") picked.current.set(c.user.id, c.user.name);
    const insert = `@${name} `;
    const next = draft.slice(0, wordStart) + insert + draft.slice(caret);
    const at = wordStart + insert.length;
    setDraft(next);
    setCaret(at);
    setMenuIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(at, at);
    });
  };

  const onDraftChange = (value: string, cursor: number) => {
    setDraft(value);
    setCaret(cursor);
    setMenuIndex(0);
    setMenuClosedAt(null);
    if (value.trim() && !muted && Date.now() - lastTypingSent.current > TYPING_SEND_MS) {
      lastTypingSent.current = Date.now();
      getSocket().emit("typing", { serverId: channel.serverId, channelId: channel.id });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (candidates.length && !e.nativeEvent.isComposing) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((activeCandidate + (e.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickCandidate(candidates[activeCandidate]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuClosedAt(wordStart);
        return;
      }
    }
    // On phones Enter adds a new line, like other messengers; the send button sends.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
      e.preventDefault();
      send();
    }
  };

  const actions: MessageActions = {
    onOpenProfile,
    onReply: (m) => {
      setReplyTo(m);
      inputRef.current?.focus();
    },
    onSaveEdit: async (m, content) => {
      const res = await api<{ message: MessageDTO }>(`/api/channels/${channel.id}/messages/${m.id}`, {
        method: "PATCH",
        body: { content },
      });
      setMessages((list) => list.map((x) => (x.id === m.id ? res.message : x)));
    },
    onDelete: setDeleting,
    onReact: (m, emoji) => {
      // The socket event updates everyone, including this tab; the response covers a slow socket.
      api<{ reactions: MessageDTO["reactions"] }>(`/api/channels/${channel.id}/messages/${m.id}/reactions`, {
        method: "PUT",
        body: { emoji },
      })
        .then((res) => setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, reactions: res.reactions } : x))))
        .catch((err) => setError(err.message));
    },
    onForward: setForwarding,
    onPin: (m, pinned) => {
      // The socket event updates everyone, including this tab; the response covers a slow socket.
      api<{ message: MessageDTO }>(`/api/channels/${channel.id}/messages/${m.id}/pin`, { method: "PUT", body: { pinned } })
        .then(({ message }) => {
          setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, pinnedAt: message.pinnedAt } : x)));
          setPins((list) => withPin(list, message));
        })
        .catch((err) => setError(err.message));
    },
    onJump: (id) => {
      const el = document.getElementById(`msg-${id}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        flash(id);
        return;
      }
      // Older (or newer) than what is loaded: load the stretch around it.
      replaceWindow(`?around=${id}`, () => {
        stickToBottom.current = false;
        pendingJump.current = id;
        flash(id);
      });
    },
    onSelect: (id, picking = false) => setSelected(id ? { id, picking } : null),
  };

  const confirmDelete = async () => {
    const target = deleting;
    if (!target) return;
    setDeleting(null);
    try {
      await api(`/api/channels/${channel.id}/messages/${target.id}`, { method: "DELETE" });
      // The broadcast also removes it, but don't wait for it.
      setMessages((list) => list.filter((x) => x.id !== target.id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const nameOf = (userId: string) => (userId === me.id ? "شما" : (memberById.get(userId)?.user.name ?? "عضو سابق"));

  const shown = q ? messages.filter((m) => matchesSearch(m.content, q) || m.attachments.some((a) => matchesSearch(a.name, q))) : messages;
  const typers = Object.values(typing).map((t) => t.user);

  return (
    <div
      className="bg-glow relative flex min-h-0 flex-1 flex-col"
      onDragOver={onDragOver}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDragging(false)}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-accent/60 bg-ink-950/80 text-sm font-semibold text-accent">
          <span className="flex items-center gap-2">
            <Paperclip className="size-5" />
            رها کنید تا پیوست شود
          </span>
        </div>
      )}
      {!q && pins.length > 0 && (
        <PinList
          pins={pins}
          open={pinsOpen}
          onToggle={() => setPinsOpen((o) => !o)}
          onPick={(id) => {
            setPinsOpen(false);
            actions.onJump(id);
          }}
        />
      )}
      {!q && newBarOpen && newSince && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-strong/10 py-1.5 ps-4 pe-2 text-xs sm:ps-5">
          <span className="min-w-0 flex-1 truncate font-semibold text-accent">
            {newSince.count > 99 ? "۹۹+" : toPersianDigits(newSince.count)} پیام تازه از آخرین بازدید
          </span>
          {(firstNewId || newSince.lastRead) && (
            <button onClick={jumpToNew} className="flex shrink-0 items-center gap-1 rounded-full bg-accent-strong px-3 py-1.5 font-semibold text-on-accent hover:brightness-105">
              <ArrowUp className="size-3.5" />
              رفتن به اولین پیام تازه
            </button>
          )}
          <button onClick={() => setNewBarOpen(false)} aria-label="بستن" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink-800 hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
      )}
      {q && shown.length > 0 && (
        <div className="shrink-0 border-b border-line px-4 py-2 text-center text-xs text-muted">
          {toPersianDigits(shown.length)} پیام پیدا شد{hasMore && " (در پیام‌های بارگذاری‌شده)"}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Scroll position is kept by hand (see the layout effect), so the browser's own anchoring must stay out of it. */}
      <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]">
        <div className="flex min-h-full flex-col justify-end px-3 py-4 sm:px-5">
          <div ref={topRef} aria-hidden />
          {hasMore && !q && <PageEdge loading={loadingMore === "older"} failed={loadFailed === "older"} onRetry={() => loadMore("older")} />}
          {loading && !messages.length && <MessagesSkeleton />}
          {!loading && !messages.length && (
            <div className="py-16 text-center">
              {dm ? (
                <span className="mx-auto inline-block rounded-full ring-4 ring-accent/20">
                  <Avatar user={dm} size="lg" />
                </span>
              ) : (
                <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent-strong/15 text-3xl font-bold text-accent ring-1 ring-accent/20">
                  #
                </span>
              )}
              <h3 className="mt-4 text-xl font-bold">{dm ? `گفت‌وگو با ${dm.name}` : `به #${channel.name} خوش آمدید`}</h3>
              <p className="mt-1 text-sm text-muted">هنوز پیامی نیست. اولین پیام را بفرستید.</p>
            </div>
          )}
          {q && !shown.length && (
            <div className="py-16 text-center text-muted">
              <SearchX className="mx-auto size-8" />
              <p className="mt-3 text-sm">پیامی با «{search}» پیدا نشد</p>
            </div>
          )}
          {shown.map((m, i) => {
            const prev = shown[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
            const isFirstNew = !q && m.id === firstNewId;
            const grouped =
              !q &&
              !newDay &&
              !isFirstNew &&
              prev.author.id === m.author.id &&
              new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;
            const mine = m.author.id === me.id;
            const author = memberById.get(m.author.id);
            return (
              <div key={m.id} data-mid={m.id}>
                {isFirstNew && (
                  <div ref={dividerRef} role="separator" className="my-3 flex items-center gap-3 text-xs font-semibold text-danger">
                    <span className="h-px flex-1 bg-danger/40" />
                    پیام‌های تازه
                    <span className="h-px flex-1 bg-danger/40" />
                  </div>
                )}
                {newDay && (
                  <div className="my-5 flex justify-center">
                    <span className="rounded-full bg-ink-800 px-3.5 py-1 text-xs font-medium text-fg/80">
                      {formatDay(m.createdAt)}
                    </span>
                  </div>
                )}
                <MessageItem
                  message={m}
                  grouped={grouped}
                  mine={mine}
                  myId={me.id}
                  pinged={pingsUser(m, me.id)}
                  highlight={q}
                  author={author}
                  roles={roles}
                  authorBadges={author?.badges}
                  authorOnline={memberById.has(m.author.id) ? !!online[m.author.id] : undefined}
                  canWrite={!muted}
                  canDelete={mine || (can(myStanding, "message:delete_any") && outranks(myStanding, author ? standingOf(author, roles) : NO_STANDING))}
                  canPin={can(myStanding, "message:pin")}
                  selected={selected?.id === m.id}
                  picking={selected?.id === m.id && selected.picking}
                  flash={flashId === m.id}
                  nameOf={nameOf}
                  actions={actions}
                />
              </div>
            );
          })}
          {hasNewer && !q && <PageEdge loading={loadingMore === "newer"} failed={loadFailed === "newer"} onRetry={() => loadMore("newer")} />}
          <div ref={bottomRef} aria-hidden />
        </div>
      </div>
      {!atBottom && !q && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-3 end-4 z-10 flex animate-pop-in items-center gap-1.5 rounded-full bg-accent-strong py-2 ps-3 pe-4 text-xs font-semibold text-on-accent shadow-lg shadow-black/40 hover:brightness-105 sm:end-6"
        >
          <ChevronDown className="size-4" />
          {hasNewer ? "رفتن به آخرین پیام‌ها" : "پایین"}
        </button>
      )}
      </div>

      <div className="shrink-0 px-3 pb-safe-4 sm:px-5 md:pb-4">
        <TypingLine users={typers} />
        <div className="flex items-end gap-3">
          <div className="hidden">
            <Avatar user={me} />
          </div>
          <div className="min-w-0 flex-1">
            {error && <p className="mb-2 text-sm text-danger">{error}</p>}
            {rulesPending ? (
              <button
                onClick={onOpenWelcome}
                className="flex w-full items-center gap-3 rounded-2xl bg-accent-strong/15 px-4 py-3 text-start text-sm text-accent ring-1 ring-accent/30 hover:bg-accent-strong/25"
              >
                <ScrollText className="size-4 shrink-0" />
                <span>برای نوشتن پیام، ابتدا قوانین سرور را بخوانید و بپذیرید.</span>
              </button>
            ) : muted && myMember?.mutedUntil ? (
              <div className="flex items-center gap-3 rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-400/20">
                <BellOff className="size-4 shrink-0" />
                <span>شما تا {formatDateTime(myMember.mutedUntil)} بی‌صدا شده‌اید و نمی‌توانید پیام بفرستید.</span>
              </div>
            ) : (
            <>
            {replyTo && (
              <div className="mb-1.5 flex items-center gap-2 rounded-2xl bg-ink-800 px-4 py-2 text-xs">
                <CornerUpLeft className="size-3.5 shrink-0 text-accent ltr:-scale-x-100" />
                <span className="min-w-0 flex-1 truncate">
                  پاسخ به <span className="font-semibold">{replyTo.author.id === me.id ? "خودتان" : replyTo.author.name}</span>
                  <span dir="auto" className="ms-2 text-muted">
                    {messageSummary(replyTo.content, replyTo.attachments)}
                  </span>
                </span>
                <button onClick={() => setReplyTo(null)} aria-label="لغو پاسخ" className="-me-2 grid size-8 place-items-center rounded-full text-muted hover:bg-ink-700 hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="relative">
            {stickersOpen && <StickerPicker onPick={sendSticker} onClose={closeStickers} />}
            {pending.length > 0 && <PendingFiles files={pending} onRemove={removePending} />}
            {candidates.length > 0 && (
              <ul
                role="listbox"
                aria-label="اعضا"
                className="absolute inset-x-0 bottom-full z-20 mb-2 surface-float animate-pop-in overflow-hidden rounded-2xl p-1"
              >
                {candidates.map((c, i) => (
                  <li key={c.kind === "user" ? c.user.id : EVERYONE} role="option" aria-selected={i === activeCandidate}>
                    <button
                      // Keep the focus in the text box while picking.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickCandidate(c)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start text-sm",
                        i === activeCandidate ? "bg-ink-700" : "hover:bg-ink-700/60",
                      )}
                    >
                      {c.kind === "user" ? (
                        <>
                          <Avatar user={c.user} online={!!online[c.user.id]} />
                          <span className="min-w-0 flex-1 truncate font-semibold">{c.user.name}</span>
                        </>
                      ) : (
                        <>
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                            <AtSign className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 leading-5">
                            <span className="block font-semibold">{EVERYONE}</span>
                            <span className="block truncate text-xs text-muted">همهٔ اعضای سرور را باخبر کنید</span>
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="relative flex items-end gap-1 rounded-[1.75rem] bg-ink-800 py-1.5 ps-5 pe-1.5 transition focus-within:ring-2 focus-within:ring-accent/60">
              {recording && <RecordingBar state={recording} />}
              <textarea
                ref={inputRef}
                dir="auto"
                rows={1}
                value={draft}
                maxLength={2000}
                onChange={(e) => onDraftChange(e.target.value, e.target.selectionStart)}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={dm ? `پیام به ${dm.name}` : `پیام به #${channel.name}`}
                className="bidi-lines field-sizing-content max-h-40 flex-1 resize-none bg-transparent py-1.5 text-base md:text-sm leading-7 outline-none placeholder:text-muted"
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="پیوست تصویر یا فایل"
                title="پیوست (حداکثر ۵ مگابایت)"
                className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-ink-700 hover:text-fg active:scale-95"
              >
                <Paperclip className="size-5" />
              </button>
              <button
                data-sticker-toggle
                onClick={() => setStickersOpen((o) => !o)}
                aria-label="استیکر"
                aria-expanded={stickersOpen}
                title="استیکر"
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-full transition hover:bg-ink-700 hover:text-fg active:scale-95",
                  stickersOpen ? "text-accent" : "text-muted",
                )}
              >
                <StickerIcon className="size-5" />
              </button>
              {/* With nothing typed or attached, the send button becomes the hold-to-record button, as in other messengers. */}
              {canRecord && !draft.trim() && !pending.length ? (
                <VoiceRecordButton sending={sendingVoice} onRecording={setRecording} onRecorded={sendVoiceNote} onError={setError} />
              ) : (
                <button
                  onClick={send}
                  disabled={!canSend}
                  aria-label="ارسال"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-strong text-on-accent transition hover:brightness-105 active:scale-95 disabled:bg-transparent disabled:text-muted disabled:shadow-none"
                >
                  <SendHorizontal className="size-5 -scale-x-100" />
                </button>
              )}
            </div>
            </div>
            </>
            )}
          </div>
        </div>
      </div>

      {forwarding && (
        <ForwardDialog
          message={forwarding}
          sourceChannelId={channel.id}
          onClose={() => setForwarding(null)}
          onForwarded={(where) => {
            setForwarding(null);
            onNotify(`پیام به ${where} فرستاده شد`);
          }}
        />
      )}

      {deleting && (
        <Modal title="حذف پیام" onClose={() => setDeleting(null)}>
          <p className="mb-3 text-sm text-muted">این پیام برای همه حذف می‌شود و برگشتی ندارد.</p>
          <p dir="auto" className="bidi-lines mb-5 line-clamp-4 whitespace-pre-wrap rounded-xl bg-ink-800 px-4 py-3 text-sm leading-7 break-words">
            {messageSummary(deleting.content, deleting.attachments)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={confirmDelete} className="rounded-xl bg-danger-strong px-4 py-2.5 font-semibold text-white hover:bg-danger-strong/90">
              حذف
            </button>
            <button onClick={() => setDeleting(null)} className="rounded-xl bg-ink-800 px-4 py-2.5 text-muted hover:text-fg">
              انصراف
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

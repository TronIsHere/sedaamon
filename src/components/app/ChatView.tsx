"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AtSign, BellOff, CornerUpLeft, SearchX, SendHorizontal, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatDay, sameDay } from "@/lib/format";
import { EVERYONE, hasMention, pingsUser } from "@/lib/mentions";
import { isTouchDevice } from "@/lib/mobile";
import { can, isMuted, msUntil, outranks } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import { getSocket } from "@/lib/socket";
import type {
  ChannelDTO,
  LiveMessageDTO,
  MeDTO,
  MemberDTO,
  MessageDeletedEvent,
  MessageDTO,
  ReactionsEvent,
  Role,
  TypingEvent,
  UserDTO,
} from "@/lib/types";
import Avatar from "./Avatar";
import { Modal } from "./Dialogs";
import MessageItem, { type MessageActions } from "./MessageItem";

const GROUP_WINDOW_MS = 5 * 60_000;
/** How often we tell others we're typing, and how long their indicator lasts without a new signal. */
const TYPING_SEND_MS = 2500;
const TYPING_SHOW_MS = 4000;

function addUnique(list: MessageDTO[], incoming: MessageDTO[]) {
  const seen = new Set(list.map((m) => m.id));
  return [...list, ...incoming.filter((m) => !seen.has(m.id))];
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
  online,
  dm,
  onOpenProfile,
}: {
  me: MeDTO;
  channel: ChannelDTO;
  /** The other person, when this is a direct conversation. */
  dm?: UserDTO;
  search: string;
  members: MemberDTO[];
  online: Record<string, boolean>;
  onOpenProfile: (userId: string) => void;
}) {
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [typing, setTyping] = useState<Record<string, { user: UserDTO; until: number }>>({});
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [selected, setSelected] = useState<{ id: string; picking: boolean } | null>(null);
  const [deleting, setDeleting] = useState<MessageDTO | null>(null);
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

  const memberById = useMemo(() => new Map(members.map((m) => [m.user.id, m])), [members]);
  const myMember = memberById.get(me.id);
  const myRole: Role = myMember?.role ?? "member";
  const muted = isMuted(myMember?.mutedUntil);

  // "@" followed by letters right before the cursor opens the member menu (not in direct messages, where there is nobody to ping).
  const word = dm || muted ? null : /(^|[\s(])@([^\s@]*)$/u.exec(draft.slice(0, caret));
  const wordStart = word ? caret - word[2].length - 1 : -1;
  const candidates: Candidate[] = useMemo(() => {
    if (!word || wordStart === menuClosedAt) return [];
    const q = word[2].toLowerCase();
    const people = members
      .filter((m) => m.user.id !== me.id && m.user.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.user.name.toLowerCase().startsWith(q)) - Number(a.user.name.toLowerCase().startsWith(q)))
      .map((m): Candidate => ({ kind: "user", user: m.user }));
    const everyone: Candidate[] = can(myRole, "message:mention_everyone") && EVERYONE.startsWith(q) ? [{ kind: "everyone" }] : [];
    return [...everyone, ...people].slice(0, MENU_SIZE);
    // `word` is derived from draft and caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, caret, members, me.id, myRole, menuClosedAt]);
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
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    const socket = getSocket();
    const onMessage = (m: MessageDTO) => {
      if (m.channelId !== channel.id) return;
      setMessages((list) => addUnique(list, [m]));
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
            ? { ...x, replyTo: { ...x.replyTo, content: m.content.slice(0, REPLY_PREVIEW_LENGTH) } }
            : x;
        }),
      );
      setReplyTo((r) => (r?.id === m.id ? m : r));
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
    };
    socket.on("user:update", onUserUpdate);
    socket.on("message:new", onMessage);
    socket.on("message:edit", onEdit);
    socket.on("message:delete", onDelete);
    socket.on("message:reactions", onReactions);
    socket.on("typing", onTyping);
    return () => {
      cancelled = true;
      socket.off("user:update", onUserUpdate);
      socket.off("message:new", onMessage);
      socket.off("message:edit", onEdit);
      socket.off("message:delete", onDelete);
      socket.off("message:reactions", onReactions);
      socket.off("typing", onTyping);
    };
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

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoading(true);
    try {
      const res = await api<{ messages: MessageDTO[]; hasMore: boolean }>(
        `/api/channels/${channel.id}/messages?before=${messages[0].id}`,
      );
      setMessages((list) => addUnique(res.messages, list));
      setHasMore(res.hasMore);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    if (muted) return;
    setError(undefined);
    lastTypingSent.current = 0;
    const replying = replyTo;
    // Clear right away so the user can keep typing; put the text back if sending fails.
    setDraft("");
    setReplyTo(null);
    try {
      const res = await api<{ message: MessageDTO }>(`/api/channels/${channel.id}/messages`, {
        body: {
          content,
          replyTo: replying?.id,
          mentions: [...picked.current].filter(([, name]) => hasMention(content, name)).map(([id]) => id),
        },
      });
      setMessages((list) => addUnique(list, [res.message]));
    } catch (err) {
      setError((err as Error).message);
      setDraft((current) => current || content);
      setReplyTo((current) => current ?? replying);
    } finally {
      inputRef.current?.focus();
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
    onJump: (id) => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlashId(id);
      window.setTimeout(() => setFlashId((current) => (current === id ? null : current)), 1400);
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

  const q = search.toLowerCase();
  const shown = q ? messages.filter((m) => m.content.toLowerCase().includes(q)) : messages;
  const typers = Object.values(typing).map((t) => t.user);

  return (
    <div className="bg-glow flex min-h-0 flex-1 flex-col">
      {q && shown.length > 0 && (
        <div className="shrink-0 border-b border-white/5 bg-ink-900/60 px-4 py-2 text-center text-xs text-muted">
          {toPersianDigits(shown.length)} پیام پیدا شد{hasMore && " (در پیام‌های بارگذاری‌شده)"}
        </div>
      )}
      {/* column-reverse keeps the view pinned to the newest message without manual scrolling */}
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
        <div className="px-3 py-4 sm:px-6">
          {hasMore && !q && (
            <div className="mb-4 text-center">
              <button
                onClick={loadOlder}
                disabled={loading}
                className="rounded-full bg-ink-850 px-4 py-1.5 text-xs text-accent ring-1 ring-white/5 hover:bg-ink-800"
              >
                پیام‌های قدیمی‌تر
              </button>
            </div>
          )}
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
            const grouped =
              !q &&
              !newDay &&
              prev.author.id === m.author.id &&
              new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;
            const mine = m.author.id === me.id;
            const authorRole = memberById.get(m.author.id)?.role;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-5 flex justify-center">
                    <span className="rounded-full bg-ink-850 px-3 py-1 text-xs text-muted ring-1 ring-white/5">
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
                  authorRole={authorRole}
                  authorOnline={memberById.has(m.author.id) ? !!online[m.author.id] : undefined}
                  canWrite={!muted}
                  canDelete={mine || (can(myRole, "message:delete_any") && outranks(myRole, authorRole ?? "member"))}
                  selected={selected?.id === m.id}
                  picking={selected?.id === m.id && selected.picking}
                  flash={flashId === m.id}
                  nameOf={nameOf}
                  actions={actions}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-safe-4 sm:px-6">
        <TypingLine users={typers} />
        <div className="flex items-end gap-3">
          <div className="hidden pb-1 sm:block">
            <Avatar user={me} />
          </div>
          <div className="min-w-0 flex-1">
            {error && <p className="mb-2 text-sm text-danger">{error}</p>}
            {muted && myMember?.mutedUntil ? (
              <div className="flex items-center gap-3 rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-400/20">
                <BellOff className="size-4 shrink-0" />
                <span>شما تا {formatDateTime(myMember.mutedUntil)} بی‌صدا شده‌اید و نمی‌توانید پیام بفرستید.</span>
              </div>
            ) : (
            <>
            {replyTo && (
              <div className="mb-1.5 flex items-center gap-2 rounded-xl bg-ink-850 px-3 py-2 text-xs ring-1 ring-white/5">
                <CornerUpLeft className="size-3.5 shrink-0 text-accent ltr:-scale-x-100" />
                <span className="min-w-0 flex-1 truncate">
                  پاسخ به <span className="font-semibold">{replyTo.author.id === me.id ? "خودتان" : replyTo.author.name}</span>
                  <span dir="auto" className="ms-2 text-muted">
                    {replyTo.content}
                  </span>
                </span>
                <button onClick={() => setReplyTo(null)} aria-label="لغو پاسخ" className="p-1 text-muted hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="relative">
            {candidates.length > 0 && (
              <ul
                role="listbox"
                aria-label="اعضا"
                className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl bg-ink-800 p-1 shadow-2xl ring-1 ring-white/10"
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
            <div className="flex items-end gap-2 rounded-2xl bg-ink-850 py-1.5 ps-4 pe-1.5 ring-1 ring-white/5 transition focus-within:ring-accent/50">
              <textarea
                ref={inputRef}
                dir="auto"
                rows={1}
                value={draft}
                maxLength={2000}
                onChange={(e) => onDraftChange(e.target.value, e.target.selectionStart)}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                onKeyDown={onKeyDown}
                placeholder={dm ? `پیام به ${dm.name}` : `پیام به #${channel.name}`}
                className="field-sizing-content max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm leading-7 outline-none placeholder:text-muted/70"
              />
              <button
                onClick={send}
                disabled={!draft.trim()}
                aria-label="ارسال"
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-strong text-white shadow-lg shadow-accent-strong/30 transition hover:bg-accent active:scale-95 disabled:bg-transparent disabled:text-muted disabled:shadow-none"
              >
                <SendHorizontal className="size-5 -scale-x-100" />
              </button>
            </div>
            </div>
            </>
            )}
          </div>
        </div>
      </div>

      {deleting && (
        <Modal title="حذف پیام" onClose={() => setDeleting(null)}>
          <p className="mb-3 text-sm text-muted">این پیام برای همه حذف می‌شود و برگشتی ندارد.</p>
          <p dir="auto" className="mb-5 line-clamp-4 rounded-xl bg-ink-950 px-4 py-3 text-sm leading-7 break-words ring-1 ring-white/5">
            {deleting.content}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={confirmDelete} className="rounded-xl bg-danger px-4 py-2.5 font-semibold text-white hover:bg-danger/90">
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

function TypingLine({ users }: { users: UserDTO[] }) {
  const names = users.map((u) => u.name);
  const text =
    names.length === 0
      ? null
      : names.length === 1
        ? `${names[0]} در حال نوشتن است`
        : names.length === 2
          ? `${names[0]} و ${names[1]} در حال نوشتن هستند`
          : `${toPersianDigits(names.length)} نفر در حال نوشتن هستند`;
  return (
    <div className="flex h-7 items-center gap-2 px-1 text-xs text-muted sm:ps-12" aria-live="polite">
      {text && (
        <>
          <span className="flex gap-0.5" aria-hidden>
            {[0, 150, 300].map((d) => (
              <span key={d} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
          <span className="truncate">{text}</span>
        </>
      )}
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-4" aria-hidden>
      {[60, 40, 75].map((w, i) => (
        <div key={w} className={cn("flex gap-3", i === 1 && "flex-row-reverse")}>
          <span className="size-9 shrink-0 rounded-full bg-ink-800" />
          <div className={cn("flex flex-1 flex-col gap-2", i === 1 && "items-end")}>
            <span className="h-3 w-20 rounded-full bg-ink-800" />
            <span className="h-10 rounded-2xl bg-ink-850" style={{ width: `${w}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

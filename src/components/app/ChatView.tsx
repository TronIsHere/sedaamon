"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { SearchX, SendHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDay, formatTime, sameDay } from "@/lib/format";
import { isTouchDevice } from "@/lib/mobile";
import { toPersianDigits } from "@/lib/phone";
import { getSocket } from "@/lib/socket";
import type { ChannelDTO, MeDTO, MessageDTO, TypingEvent, UserDTO } from "@/lib/types";
import Avatar from "./Avatar";

const GROUP_WINDOW_MS = 5 * 60_000;
/** How often we tell others we're typing, and how long their indicator lasts without a new signal. */
const TYPING_SEND_MS = 2500;
const TYPING_SHOW_MS = 4000;

function addUnique(list: MessageDTO[], incoming: MessageDTO[]) {
  const seen = new Set(list.map((m) => m.id));
  return [...list, ...incoming.filter((m) => !seen.has(m.id))];
}

export default function ChatView({ me, channel, search }: { me: MeDTO; channel: ChannelDTO; search: string }) {
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [typing, setTyping] = useState<Record<string, { user: UserDTO; until: number }>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);

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
    const onTyping = ({ channelId, user }: TypingEvent) => {
      if (channelId === channel.id && user.id !== me.id)
        setTyping((t) => ({ ...t, [user.id]: { user, until: Date.now() + TYPING_SHOW_MS } }));
    };
    socket.on("message:new", onMessage);
    socket.on("typing", onTyping);
    return () => {
      cancelled = true;
      socket.off("message:new", onMessage);
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
    setError(undefined);
    lastTypingSent.current = 0;
    // Clear right away so the user can keep typing; put the text back if sending fails.
    setDraft("");
    try {
      const res = await api<{ message: MessageDTO }>(`/api/channels/${channel.id}/messages`, { body: { content } });
      setMessages((list) => addUnique(list, [res.message]));
    } catch (err) {
      setError((err as Error).message);
      setDraft((current) => current || content);
    } finally {
      inputRef.current?.focus();
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (value.trim() && Date.now() - lastTypingSent.current > TYPING_SEND_MS) {
      lastTypingSent.current = Date.now();
      getSocket().emit("typing", { serverId: channel.serverId, channelId: channel.id });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // On phones Enter adds a new line, like other messengers; the send button sends.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
      e.preventDefault();
      send();
    }
  };

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
              <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent-strong/15 text-3xl font-bold text-accent ring-1 ring-accent/20">
                #
              </span>
              <h3 className="mt-4 text-xl font-bold">به #{channel.name} خوش آمدید</h3>
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
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-5 flex justify-center">
                    <span className="rounded-full bg-ink-850 px-3 py-1 text-xs text-muted ring-1 ring-white/5">
                      {formatDay(m.createdAt)}
                    </span>
                  </div>
                )}
                <div className={cn("group flex gap-3", mine && "flex-row-reverse", grouped ? "mt-1" : "mt-5")}>
                  <div className="w-9 shrink-0">{!grouped && <Avatar user={m.author} />}</div>
                  <div className={cn("flex min-w-0 max-w-[min(34rem,80%)] flex-col", mine ? "items-end" : "items-start")}>
                    {!grouped && (
                      <div className={cn("mb-1.5 flex items-baseline gap-3 px-1", mine && "flex-row-reverse")}>
                        <span className="text-sm font-semibold">{mine ? "شما" : m.author.name}</span>
                        <span className="text-[11px] text-muted">{formatTime(m.createdAt)}</span>
                      </div>
                    )}
                    <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                      <p
                        dir="auto"
                        className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm leading-7 whitespace-pre-wrap break-words",
                          mine
                            ? "bg-accent-strong text-white shadow-lg shadow-accent-strong/20"
                            : "bg-ink-850 text-fg ring-1 ring-white/5",
                          !grouped && (mine ? "rounded-se-md" : "rounded-ss-md"),
                        )}
                      >
                        <RichText text={m.content} mine={mine} highlight={q} />
                      </p>
                      {grouped && (
                        <span className="mb-1 shrink-0 text-[10px] text-muted opacity-0 transition group-hover:opacity-100">
                          {formatTime(m.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
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
            <div className="flex items-end gap-2 rounded-2xl bg-ink-850 py-1.5 ps-4 pe-1.5 ring-1 ring-white/5 transition focus-within:ring-accent/50">
              <textarea
                ref={inputRef}
                dir="auto"
                rows={1}
                value={draft}
                maxLength={2000}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`پیام به #${channel.name}`}
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
        </div>
      </div>
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

const TOKEN = /(https?:\/\/[^\s]+|@[^\s@]+)/g;

/** Message text with clickable links, highlighted @mentions and search matches. */
function RichText({ text, mine, highlight }: { text: string; mine: boolean; highlight: string }) {
  return text.split(TOKEN).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{mark(part, highlight)}</Fragment>;
    if (part.startsWith("@"))
      return (
        <span key={i} className={cn("rounded px-0.5 font-semibold", mine ? "bg-white/15" : "bg-accent/15 text-accent")}>
          {mark(part, highlight)}
        </span>
      );
    return (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        dir="ltr"
        className={cn("break-all underline underline-offset-2", mine ? "text-white" : "text-accent")}
      >
        {mark(part, highlight)}
      </a>
    );
  });
}

function mark(text: string, q: string): ReactNode {
  if (!q) return text;
  const out: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    out.push(text.slice(from, at));
    out.push(
      <mark key={at} className="rounded bg-amber-300/80 px-0.5 text-ink-950">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    from = at + q.length;
  }
  out.push(text.slice(from));
  return out;
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

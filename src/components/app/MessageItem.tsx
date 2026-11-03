"use client";

import { Fragment, useState, type KeyboardEvent, type ReactNode } from "react";
import { CornerUpLeft, Pencil, Reply, SmilePlus, Trash2, X } from "lucide-react";
import { cn, formatTime } from "@/lib/format";
import { findMentions, mentionNames } from "@/lib/mentions";
import { isTouchDevice } from "@/lib/mobile";
import { REACTION_EMOJIS } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import type { MessageDTO, Role } from "@/lib/types";
import Avatar from "./Avatar";
import { RoleIcon } from "./RoleBadge";

export interface MessageActions {
  onOpenProfile: (userId: string) => void;
  onReply: (m: MessageDTO) => void;
  /** Rejects with the server's message when saving fails. */
  onSaveEdit: (m: MessageDTO, content: string) => Promise<void>;
  onDelete: (m: MessageDTO) => void;
  onReact: (m: MessageDTO, emoji: string) => void;
  onJump: (messageId: string) => void;
  /** Opens the action bar of one message (or its emoji row), or closes it with null. */
  onSelect: (messageId: string | null, picking?: boolean) => void;
}

export default function MessageItem({
  message: m,
  grouped,
  mine,
  myId,
  pinged,
  highlight,
  authorRole,
  authorOnline,
  canWrite,
  canDelete,
  selected,
  picking,
  flash,
  nameOf,
  actions,
}: {
  message: MessageDTO;
  grouped: boolean;
  mine: boolean;
  myId: string;
  /** The message names me, reaches everyone, or replies to me. */
  pinged: boolean;
  highlight: string;
  authorRole: Role | undefined;
  authorOnline: boolean | undefined;
  /** False while muted. */
  canWrite: boolean;
  canDelete: boolean;
  selected: boolean;
  /** The emoji row is open instead of the buttons. */
  picking: boolean;
  flash: boolean;
  nameOf: (userId: string) => string;
  actions: MessageActions;
}) {
  const [editing, setEditing] = useState<{ text: string; busy: boolean; error?: string } | null>(null);

  const startEdit = () => {
    actions.onSelect(null);
    setEditing({ text: m.content, busy: false });
  };

  const saveEdit = async () => {
    if (!editing || editing.busy) return;
    const text = editing.text.trim();
    if (!text) return;
    if (text === m.content) return setEditing(null);
    setEditing({ ...editing, busy: true, error: undefined });
    try {
      await actions.onSaveEdit(m, text);
      setEditing(null);
    } catch (err) {
      setEditing({ text: editing.text, busy: false, error: (err as Error).message });
    }
  };

  const onEditKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") setEditing(null);
    else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
      e.preventDefault();
      saveEdit();
    }
  };

  const toggleSelect = (e: React.MouseEvent) => {
    // Phones have no hover, so a tap on the bubble reveals the action bar. Links keep working.
    if (!isTouchDevice() || (e.target as HTMLElement).closest("a")) return;
    actions.onSelect(selected ? null : m.id);
  };

  const hasActions = canWrite || canDelete;

  return (
    <div
      id={`msg-${m.id}`}
      className={cn(
        "group flex gap-3 rounded-2xl transition-colors duration-700",
        mine && "flex-row-reverse",
        grouped ? "mt-1" : "mt-5",
        pinged && "-mx-2 bg-accent/10 px-2 py-1.5 ring-1 ring-accent/30",
        flash && "bg-accent/15",
      )}
    >
      <div className="w-9 shrink-0">
        {!grouped && (
          <button onClick={() => actions.onOpenProfile(m.author.id)} aria-label={`پروفایل ${m.author.name}`} className="rounded-full">
            <Avatar user={m.author} online={authorOnline} />
          </button>
        )}
      </div>

      <div className={cn("relative flex min-w-0 max-w-[min(34rem,80%)] flex-col", mine ? "items-end" : "items-start")}>
        {!grouped && (
          <div className={cn("mb-1.5 flex items-center gap-2 px-1", mine && "flex-row-reverse")}>
            <button onClick={() => actions.onOpenProfile(m.author.id)} className="flex items-center gap-1.5 text-sm font-semibold hover:underline">
              {mine ? "شما" : m.author.name}
              {authorRole && <RoleIcon role={authorRole} />}
            </button>
            <span className="text-[11px] text-muted">{formatTime(m.createdAt)}</span>
          </div>
        )}

        {m.replyTo && <ReplyQuote reply={m.replyTo} onJump={actions.onJump} />}

        <div className={cn("flex max-w-full items-end gap-2", mine && "flex-row-reverse")}>
          {editing ? (
            <div className="w-[min(30rem,70vw)] max-w-full space-y-2 rounded-2xl bg-ink-850 p-2 ring-1 ring-accent/50">
              <textarea
                ref={focusAtEnd}
                dir="auto"
                value={editing.text}
                maxLength={2000}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                onKeyDown={onEditKey}
                aria-label="ویرایش پیام"
                className="field-sizing-content max-h-48 min-h-10 w-full resize-none bg-transparent px-2 py-1 text-sm leading-7 outline-none"
              />
              {editing.error && <p className="px-2 text-xs text-danger">{editing.error}</p>}
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="hidden text-[11px] text-muted sm:block">Esc برای لغو · Enter برای ذخیره</span>
                <div className="ms-auto flex gap-1.5">
                  <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-fg">
                    انصراف
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={editing.busy || !editing.text.trim()}
                    className="rounded-lg bg-accent-strong px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent disabled:opacity-50"
                  >
                    ذخیره
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p
              dir="auto"
              onClick={toggleSelect}
              className={cn(
                "rounded-2xl px-4 py-2.5 text-sm leading-7 whitespace-pre-wrap break-words",
                mine ? "bg-accent-strong text-white shadow-lg shadow-accent-strong/20" : "bg-ink-850 text-fg ring-1 ring-white/5",
                !grouped && !m.replyTo && (mine ? "rounded-se-md" : "rounded-ss-md"),
              )}
            >
              <RichText text={m.content} names={mentionNames(m)} myId={myId} mentions={m.mentions} mine={mine} highlight={highlight} />
              {m.editedAt && (
                <span className={cn("ms-2 text-[10px]", mine ? "text-white/60" : "text-muted")} title="این پیام ویرایش شده است">
                  (ویرایش‌شده)
                </span>
              )}
            </p>
          )}
          {grouped && !editing && (
            <span className="mb-1 shrink-0 text-[10px] text-muted opacity-0 transition group-hover:opacity-100">
              {formatTime(m.createdAt)}
            </span>
          )}
        </div>

        {m.reactions.length > 0 && (
          <div className={cn("mt-1.5 flex flex-wrap gap-1", mine && "justify-end")}>
            {m.reactions.map((r) => {
              const reacted = r.users.includes(myId);
              return (
                <button
                  key={r.emoji}
                  disabled={!canWrite}
                  aria-pressed={reacted}
                  onClick={() => actions.onReact(m, r.emoji)}
                  title={r.users.slice(0, 10).map(nameOf).join("، ") + (r.users.length > 10 ? "…" : "")}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 transition disabled:cursor-default",
                    reacted ? "bg-accent-strong/20 text-fg ring-accent/60" : "bg-ink-850 text-muted ring-white/5 enabled:hover:ring-white/20",
                  )}
                >
                  <span className="text-sm leading-5">{r.emoji}</span>
                  {toPersianDigits(r.users.length)}
                </button>
              );
            })}
          </div>
        )}

        {hasActions && !editing && (
          <div
            className={cn(
              "absolute -top-4 z-10 items-center gap-0.5 rounded-xl bg-ink-800 p-0.5 shadow-xl ring-1 ring-white/10",
              mine ? "end-0" : "start-0",
              selected ? "flex" : "hidden group-focus-within:flex group-hover:flex",
            )}
          >
            {selected && picking ? (
              <>
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      actions.onSelect(null);
                      actions.onReact(m, emoji);
                    }}
                    aria-label={`واکنش ${emoji}`}
                    className="grid size-8 place-items-center rounded-lg text-base hover:bg-ink-700 active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
                <BarButton label="بستن" onClick={() => actions.onSelect(m.id)}>
                  <X className="size-4" />
                </BarButton>
              </>
            ) : (
              <>
                {canWrite && (
                  <>
                    <BarButton label="افزودن واکنش" onClick={() => actions.onSelect(m.id, true)}>
                      <SmilePlus className="size-4" />
                    </BarButton>
                    <BarButton
                      label="پاسخ"
                      onClick={() => {
                        actions.onSelect(null);
                        actions.onReply(m);
                      }}
                    >
                      <Reply className="size-4 ltr:-scale-x-100" />
                    </BarButton>
                  </>
                )}
                {mine && canWrite && (
                  <BarButton label="ویرایش" onClick={startEdit}>
                    <Pencil className="size-4" />
                  </BarButton>
                )}
                {canDelete && (
                  <BarButton
                    label="حذف"
                    danger
                    onClick={() => {
                      actions.onSelect(null);
                      actions.onDelete(m);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </BarButton>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Focuses an edit box as it appears, with the cursor after the existing text. */
function focusAtEnd(el: HTMLTextAreaElement | null) {
  if (!el || el.dataset.focused) return;
  el.dataset.focused = "1";
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
}

function BarButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted hover:bg-ink-700 active:scale-90",
        danger ? "hover:text-danger" : "hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function ReplyQuote({ reply, onJump }: { reply: NonNullable<MessageDTO["replyTo"]>; onJump: (id: string) => void }) {
  return (
    <button
      onClick={() => !reply.deleted && onJump(reply.id)}
      disabled={reply.deleted}
      className="mb-1 flex max-w-full items-center gap-1.5 rounded-xl border-s-2 border-accent/60 bg-ink-850/80 px-2.5 py-1.5 text-start text-xs text-muted enabled:hover:bg-ink-800"
    >
      <CornerUpLeft className="size-3.5 shrink-0 text-accent ltr:-scale-x-100" />
      {reply.deleted || !reply.author ? (
        <span className="italic">پیام اصلی حذف شده است</span>
      ) : (
        <>
          <span className="shrink-0 font-semibold text-fg/80">{reply.author.name}</span>
          <span dir="auto" className="truncate">
            {reply.content}
          </span>
        </>
      )}
    </button>
  );
}

const LINK = /(https?:\/\/[^\s]+)/g;

/** Message text with clickable links, highlighted @mentions and search matches. */
function RichText({
  text,
  names,
  mentions,
  myId,
  mine,
  highlight,
}: {
  text: string;
  /** What follows an "@" in this message to ping someone. */
  names: string[];
  mentions: MessageDTO["mentions"];
  myId: string;
  mine: boolean;
  highlight: string;
}) {
  const me = mentions.find((x) => x.id === myId)?.name;
  return text.split(LINK).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{withMentions(part, names, me, mine, highlight)}</Fragment>;
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

function withMentions(text: string, names: string[], me: string | undefined, mine: boolean, highlight: string) {
  const out: ReactNode[] = [];
  let from = 0;
  for (const { start, end } of findMentions(text, names)) {
    out.push(mark(text.slice(from, start), highlight));
    const label = text.slice(start, end);
    out.push(
      <span
        key={start}
        className={cn(
          "rounded px-0.5 font-semibold",
          mine ? "bg-white/15" : "bg-accent/15 text-accent",
          // The one aimed at you stands out.
          label === `@${me}` && !mine && "bg-amber-300/20 text-amber-200",
        )}
      >
        {mark(label, highlight)}
      </span>,
    );
    from = end;
  }
  out.push(mark(text.slice(from), highlight));
  return out;
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

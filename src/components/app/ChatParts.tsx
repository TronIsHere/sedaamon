"use client";

import { ChevronDown, FileText, Pin, X } from "lucide-react";
import { formatBytes, messageSummary } from "@/lib/attachments";
import { cn, formatDateTime } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { MessageDTO, UserDTO } from "@/lib/types";
import Skeleton from "@/components/ui/skeleton";

// The smaller pieces of the chat view: the list's edges, the pin strip, the typing line and the composer's pending files.

/** A file picked in the composer. It uploads right away, so sending only has to name it. */
export interface PendingFile {
  key: string;
  name: string;
  size: number;
  kind: "image" | "file";
  /** A local copy of a picture, for its thumbnail here and, once sent, for showing it without downloading it back. */
  localUrl?: string;
  progress: number;
  /** Set once the upload is done. */
  id?: string;
  error?: string;
  abort: AbortController;
}

/** The strip at either end of the message list while more pages exist; its height is fixed so loading never moves the view. */
export function PageEdge({ loading, failed, onRetry }: { loading: boolean; failed: boolean; onRetry: () => void }) {
  return (
    <div className="grid h-10 shrink-0 place-items-center text-xs text-muted" aria-live="polite">
      {failed ? (
        <button onClick={onRetry} className="rounded-full bg-ink-800 px-4 py-1.5 text-accent hover:bg-ink-700">
          تلاش دوباره
        </button>
      ) : (
        loading && <span className="animate-pulse">در حال بارگذاری…</span>
      )}
    </div>
  );
}

/** The channel's pinned messages: the newest one on a single line that opens into the full list. */
export function PinList({
  pins,
  open,
  onToggle,
  onPick,
}: {
  pins: MessageDTO[];
  open: boolean;
  onToggle: () => void;
  onPick: (messageId: string) => void;
}) {
  return (
    <div className="shrink-0 border-b border-line">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-xs transition-colors hover:bg-ink-850 sm:px-5"
      >
        <Pin className="size-3.5 shrink-0 text-accent" />
        <span className="shrink-0 font-semibold">{toPersianDigits(pins.length)} پیام سنجاق‌شده</span>
        {!open && (
          <span dir="auto" className="min-w-0 flex-1 truncate text-muted">
            {messageSummary(pins[0].content, pins[0].attachments)}
          </span>
        )}
        <ChevronDown className={cn("ms-auto size-4 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="scrollbar-thin max-h-60 overflow-y-auto px-2 pb-2 sm:px-4">
          {pins.map((p) => (
            <li key={p.id}>
              <button onClick={() => onPick(p.id)} className="w-full rounded-xl px-3 py-2 text-start hover:bg-ink-800">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-fg/80">{p.author.name}</span>
                  {formatDateTime(p.createdAt)}
                </span>
                <span dir="auto" className="mt-0.5 line-clamp-2 block text-sm leading-6 break-words">
                  {messageSummary(p.content, p.attachments)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TypingLine({ users }: { users: UserDTO[] }) {
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
    <div className="flex h-7 items-center gap-2 ps-5 text-xs text-muted" aria-live="polite">
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

export function MessagesSkeleton() {
  return (
    <div className="space-y-6 py-4" aria-hidden>
      {[60, 40, 75].map((w) => (
        <div key={w} className="flex gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-4 rounded-full bg-ink-850" style={{ width: `${w}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Files picked for the next message, each with its upload progress and a button to take it back out. */
export function PendingFiles({ files, onRemove }: { files: PendingFile[]; onRemove: (f: PendingFile) => void }) {
  return (
    <ul aria-label="پیوست‌ها" className="scrollbar-thin mb-1.5 flex gap-2 overflow-x-auto pb-1">
      {files.map((f) => (
        <li
          key={f.key}
          title={f.error ?? f.name}
          className={cn(
            "relative flex h-16 shrink-0 items-center overflow-hidden rounded-2xl bg-ink-800 ring-1",
            f.error ? "ring-danger/70" : "ring-line",
            f.kind === "image" ? "w-16" : "w-52 gap-2 ps-2 pe-8",
          )}
        >
          {f.kind === "image" && f.localUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.localUrl} alt={f.name} className="size-full object-cover" />
          ) : (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1 text-xs">
                <span dir="auto" className="block truncate font-semibold">
                  {f.name}
                </span>
                <span className={cn("block", f.error ? "text-danger" : "text-muted")}>{f.error ? "ناموفق" : formatBytes(f.size)}</span>
              </span>
            </>
          )}
          {!f.id && !f.error && (
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-ink-950/60">
              <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(f.progress * 100)}%` }} />
            </span>
          )}
          {f.error && f.kind === "image" && <span className="absolute inset-0 bg-danger-strong/40" />}
          <button
            onClick={() => onRemove(f)}
            aria-label={`حذف ${f.name}`}
            className="absolute top-1 end-1 grid size-6 place-items-center rounded-full bg-ink-950/75 text-fg hover:bg-ink-950"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

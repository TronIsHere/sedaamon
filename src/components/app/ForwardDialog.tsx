"use client";

import { useEffect, useState } from "react";
import { Check, Hash, Loader2, Search, SendHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { messageSummary } from "@/lib/attachments";
import { cn } from "@/lib/format";
import { foldForSearch, matchesSearch } from "@/lib/search";
import type { ForwardTargetsDTO, MessageDTO } from "@/lib/types";
import Avatar from "./Avatar";
import { Modal } from "./Dialogs";

type Target = { kind: "channel"; id: string } | { kind: "user"; id: string };

/** Picks where a message goes: another channel the person can write in, or someone they can message. */
export default function ForwardDialog({
  message,
  sourceChannelId,
  onClose,
  onForwarded,
}: {
  message: MessageDTO;
  sourceChannelId: string;
  onClose: () => void;
  /** Called after the copy was sent, with where it went. */
  onForwarded: (where: string) => void;
}) {
  const [targets, setTargets] = useState<ForwardTargetsDTO | null>(null);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ target: Target; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<ForwardTargetsDTO>("/api/forward-targets")
      .then((t) => !cancelled && setTargets(t))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const q = foldForSearch(query.trim());
  const people = targets?.people.filter((u) => matchesSearch(u.name, q)) ?? [];
  const servers =
    targets?.servers
      .map((s) => ({ ...s, channels: s.channels.filter((c) => c.id !== sourceChannelId && (matchesSearch(c.name, q) || matchesSearch(s.name, q))) }))
      .filter((s) => s.channels.length) ?? [];

  const send = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/channels/${sourceChannelId}/messages/${message.id}/forward`, {
        body: picked.target.kind === "channel" ? { channelId: picked.target.id } : { userId: picked.target.id },
      });
      onForwarded(picked.label);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const isPicked = (t: Target) => picked?.target.kind === t.kind && picked.target.id === t.id;
  const rowClass = (on: boolean) =>
    cn("flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start text-sm", on ? "bg-accent-strong/20 ring-1 ring-accent/50" : "hover:bg-ink-850");

  return (
    <Modal title="ارسال پیام به…" onClose={onClose}>
      <div className="mb-3 rounded-xl border-s-2 border-accent/60 bg-ink-850 px-3 py-2 text-xs ring-1 ring-line">
        <span className="font-semibold text-fg/80">{message.forwardedFrom?.authorName ?? message.author.name}</span>
        <span dir="auto" className="mt-0.5 line-clamp-2 block leading-6 break-words text-muted">
          {messageSummary(message.content, message.attachments)}
        </span>
      </div>

      <label className="mb-3 flex items-center gap-2 rounded-xl bg-ink-850 px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent/60">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی کانال یا شخص"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted md:text-sm"
        />
      </label>

      <div className="scrollbar-thin max-h-72 space-y-3 overflow-y-auto">
        {!targets && !error && (
          <div className="grid place-items-center py-8 text-muted">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {targets && !people.length && !servers.length && <p className="py-8 text-center text-sm text-muted">مقصدی پیدا نشد</p>}

        {people.length > 0 && (
          <section>
            <h3 className="mb-1 px-1 text-xs font-semibold text-muted">پیام مستقیم</h3>
            <ul>
              {people.map((u) => (
                <li key={u.id}>
                  <button onClick={() => setPicked({ target: { kind: "user", id: u.id }, label: u.name })} className={rowClass(isPicked({ kind: "user", id: u.id }))}>
                    <Avatar user={u} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{u.name}</span>
                    {isPicked({ kind: "user", id: u.id }) && <Check className="size-4 text-accent" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {servers.map((s) => (
          <section key={s.id}>
            <h3 className="mb-1 truncate px-1 text-xs font-semibold text-muted">{s.name}</h3>
            <ul>
              {s.channels.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setPicked({ target: { kind: "channel", id: c.id }, label: `#${c.name}` })} className={rowClass(isPicked({ kind: "channel", id: c.id }))}>
                    <Hash className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {isPicked({ kind: "channel", id: c.id }) && <Check className="size-4 text-accent" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button onClick={send} disabled={!picked || busy} className="btn-primary mt-4 w-full">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4 -scale-x-100" />}
        {picked ? `ارسال به ${picked.label}` : "ارسال"}
      </button>
    </Modal>
  );
}

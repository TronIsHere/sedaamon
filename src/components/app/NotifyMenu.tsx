"use client";

import { useState, type ReactNode } from "react";
import { Bell, BellOff, Check, CheckCheck, Loader2 } from "lucide-react";
import { cn, formatDateTime } from "@/lib/format";
import { isMutedUntil, LEVEL_LABELS, MUTE_CHOICES, mutedForever, type EffectiveNotify } from "@/lib/notify";
import type { NotifyLevel, NotifySettingDTO } from "@/lib/types";
import { Popover, type PopoverTriggerProps } from "@/components/ui/popover";
import type { NotifyChange } from "./useNotifySettings";

const rowClass = "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-ink-800 disabled:opacity-60";

/**
 * Mute a server, channel or conversation for a while (or until turned back on), and choose between every message
 * and only pings. A channel can also go back to following its server. Servers get "mark as read" here too.
 */
export default function NotifyMenu({
  title,
  scope,
  setting,
  server,
  levels = true,
  onChange,
  onMarkRead,
  onNotify,
  side,
  align,
  children,
}: {
  title: string;
  scope: NotifySettingDTO["scope"];
  /** This place's own choice, if it has one. */
  setting?: NotifySettingDTO;
  /** For a channel: what its server says, shown on the "follow the server" choice. */
  server?: EffectiveNotify;
  /** Conversations have nothing to ping in, so they only get the mute. */
  levels?: boolean;
  onChange: (change: NotifyChange) => Promise<void>;
  onMarkRead?: () => Promise<void>;
  onNotify: (message: string) => void;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  children: (props: PopoverTriggerProps) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>, done?: string) => {
    setBusy(key);
    try {
      await action();
      if (done) onNotify(done);
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const muted = isMutedUntil(setting?.mutedUntil);
  const level = setting?.level ?? null;
  const choices: { value: NotifyLevel | null; label: string }[] =
    scope === "channel"
      ? [{ value: null, label: `مثل سرور (${LEVEL_LABELS[server?.level ?? "all"]})` }, { value: "all", label: LEVEL_LABELS.all }, { value: "mentions", label: LEVEL_LABELS.mentions }]
      : [{ value: "all", label: LEVEL_LABELS.all }, { value: "mentions", label: LEVEL_LABELS.mentions }];
  const chosen = scope === "server" ? (level ?? "all") : level;

  return (
    <Popover label={title} side={side} align={align} open={open} onOpenChange={setOpen} trigger={children}>
      <div className="space-y-4">
        <p className="font-semibold">{title}</p>

        {onMarkRead && (
          <button disabled={!!busy} onClick={() => run("read", onMarkRead, "همهٔ پیام‌ها خوانده شد")} className={cn(rowClass, "-mt-1 bg-ink-850")}>
            {busy === "read" ? <Loader2 className="size-4 animate-spin text-accent" /> : <CheckCheck className="size-4 text-accent" />}
            علامت‌گذاری همه به‌عنوان خوانده‌شده
          </button>
        )}

        <section className="space-y-1">
          <h3 className="px-1 text-xs font-semibold text-muted">بی‌صدا کردن</h3>
          {muted ? (
            <div className="flex items-center gap-3 rounded-xl bg-amber-400/10 px-3 py-2 text-amber-200 ring-1 ring-amber-400/20">
              <BellOff className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 text-xs leading-5">
                {mutedForever(setting?.mutedUntil) ? "بی‌صدا تا وقتی دوباره روشن کنید" : `بی‌صدا تا ${formatDateTime(setting!.mutedUntil!)}`}
              </span>
              <button
                disabled={!!busy}
                onClick={() => run("unmute", () => onChange({ mute: false }), "صدای اعلان‌ها دوباره روشن شد")}
                className="shrink-0 rounded-full bg-ink-800 px-3 py-1 text-xs font-semibold text-fg hover:bg-ink-700"
              >
                روشن کردن
              </button>
            </div>
          ) : (
            <>
              {scope === "channel" && server?.mutedBy === "server" && <p className="px-1 pb-1 text-xs leading-5 text-amber-200">صدای کل این سرور قطع است.</p>}
              {MUTE_CHOICES.map((c) => (
                <button
                  key={c.label}
                  disabled={!!busy}
                  onClick={() => run(`mute:${c.label}`, () => onChange({ mute: c.minutes ?? "forever" }), "بی‌صدا شد")}
                  className={rowClass}
                >
                  {busy === `mute:${c.label}` ? <Loader2 className="size-4 animate-spin text-muted" /> : <BellOff className="size-4 text-muted" />}
                  {c.label}
                </button>
              ))}
            </>
          )}
        </section>

        {levels && (
          <section className="space-y-1" role="radiogroup" aria-label="اعلان برای">
            <h3 className="px-1 text-xs font-semibold text-muted">اعلان برای</h3>
            {choices.map((c) => {
              const selected = chosen === c.value;
              return (
                <button
                  key={c.value ?? "inherit"}
                  role="radio"
                  aria-checked={selected}
                  disabled={!!busy}
                  onClick={() => !selected && run(`level:${c.value}`, () => onChange({ level: c.value }))}
                  className={cn(rowClass, selected && "text-accent")}
                >
                  {busy === `level:${c.value}` ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : selected ? (
                    <Check className="size-4" />
                  ) : (
                    <Bell className="size-4 text-muted" />
                  )}
                  {c.label}
                </button>
              );
            })}
          </section>
        )}
      </div>
    </Popover>
  );
}

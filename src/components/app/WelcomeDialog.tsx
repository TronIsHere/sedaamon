"use client";

import { useState } from "react";
import { Check, Hash, Loader2, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { ChannelDTO, OnboardingDTO, ServerDTO, WelcomeDTO } from "@/lib/types";
import { ServerAvatar } from "./Avatar";
import { BadgeIcon } from "./Badges";
import { Modal, useSubmit } from "./Dialogs";

/**
 * What a newcomer sees: the server's greeting, its rules (to be accepted when the server asks for it) and the
 * channels to start in. Finishing clears the pending state and lands them in the chosen channel.
 */
export default function WelcomeDialog({
  server,
  welcome,
  channels,
  onboarding,
  onClose,
  onDone,
}: {
  server: ServerDTO;
  welcome: WelcomeDTO;
  channels: ChannelDTO[];
  onboarding: OnboardingDTO;
  /** Closes the screen for now; the server keeps asking until the flow is finished. */
  onClose: () => void;
  /** The flow is finished; `channelId` is where to go next. */
  onDone: (channelId: string | null) => void;
}) {
  const starters = welcome.channelIds.flatMap((id) => channels.find((c) => c.id === id) ?? []);
  const hasRules = welcome.rules.length > 0;
  const [accepted, setAccepted] = useState(false);
  const [destination, setDestination] = useState<string | null>(starters[0]?.id ?? null);

  const { busy, error, submit } = useSubmit(
    () => api(`/api/servers/${server.id}/welcome`, { body: { acceptRules: accepted } }),
    () => onDone(destination),
  );
  const blocked = onboarding.rulesPending && !accepted;

  return (
    <Modal title="خوش آمدید" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="flex flex-col items-center text-center">
          <ServerAvatar name={server.name} className="size-20 rounded-3xl text-3xl" />
          <h2 className="mt-3 text-xl font-bold">{welcome.title || `به ${server.name} خوش آمدید`}</h2>
          {welcome.message && (
            <p dir="auto" className="bidi-lines mt-2 text-sm leading-7 whitespace-pre-wrap break-words text-muted">
              {welcome.message}
            </p>
          )}
          <p className="mt-3 flex items-center gap-1.5 rounded-full bg-ink-850 px-3 py-1 text-xs text-muted ring-1 ring-line">
            <BadgeIcon id="newcomer" size={20} />
            تا یک هفته «عضو جدید» هستید
          </p>
        </div>

        {hasRules && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">قوانین سرور</h3>
            <ol className="space-y-1.5 rounded-2xl bg-ink-850 p-3 ring-1 ring-line">
              {welcome.rules.map((rule, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-7">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-accent-strong/20 text-[11px] font-bold text-accent">{toPersianDigits(i + 1)}</span>
                  <span dir="auto" className="min-w-0 break-words">
                    {rule}
                  </span>
                </li>
              ))}
            </ol>
            <label
              className={cn(
                "mt-3 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                accepted ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
              )}
            >
              <input type="checkbox" className="sr-only" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", accepted ? "border-accent bg-accent-strong text-on-accent" : "border-ink-600")}>
                {accepted && <Check className="size-3.5" />}
              </span>
              قوانین را خوانده‌ام و می‌پذیرم
              {onboarding.rulesPending && <span className="ms-auto text-xs text-muted">لازم است</span>}
            </label>
          </section>
        )}

        {starters.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">از اینجا شروع کنید</h3>
            <ul className="space-y-1">
              {starters.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setDestination(c.id)}
                    aria-pressed={destination === c.id}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm",
                      destination === c.id ? "bg-accent-strong/20 ring-1 ring-accent/50" : "bg-ink-850 hover:bg-ink-800",
                    )}
                  >
                    {c.type === "text" ? <Hash className="size-4 shrink-0 text-muted" /> : <Volume2 className="size-4 shrink-0 text-muted" />}
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={busy || blocked} className="btn-primary w-full">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {hasRules && onboarding.rulesPending ? "پذیرفتن و ورود" : "شروع"}
        </button>
      </form>
    </Modal>
  );
}

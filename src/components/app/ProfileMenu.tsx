"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Settings, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import { STATUSES } from "@/lib/status";
import type { MeDTO, Status } from "@/lib/types";
import { Popover, type PopoverTriggerProps } from "@/components/ui/popover";
import Avatar from "./Avatar";

/**
 * Your own avatar opens this: status and bio change in place, and the gear opens the account settings
 * for the name, picture and the rest.
 */
export default function ProfileMenu({
  me,
  side,
  align,
  onMeChange,
  onSettings,
  onNotify,
  children,
}: {
  me: MeDTO;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  onMeChange: (me: MeDTO) => void;
  onSettings: () => void;
  onNotify: (message: string) => void;
  children: (props: PopoverTriggerProps) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover label="وضعیت و پروفایل" side={side} align={align} open={open} onOpenChange={setOpen} trigger={children}>
      <QuickProfile
        me={me}
        onMeChange={onMeChange}
        onNotify={onNotify}
        onSettings={() => {
          setOpen(false);
          onSettings();
        }}
      />
    </Popover>
  );
}

const save = (body: Partial<Pick<MeDTO, "status" | "statusText" | "bio">>) =>
  api<{ user: MeDTO }>("/api/me", { method: "PATCH", body }).then((res) => res.user);

/** Mounted only while the popover is open, so the fields start from the saved profile every time. */
function QuickProfile({
  me,
  onMeChange,
  onSettings,
  onNotify,
}: {
  me: MeDTO;
  onMeChange: (me: MeDTO) => void;
  onSettings: () => void;
  onNotify: (message: string) => void;
}) {
  const [statusText, setStatusText] = useState(me.statusText ?? "");
  const [bio, setBio] = useState(me.bio);
  const [busy, setBusy] = useState(false);
  const status = me.status ?? "available";
  const dirty = statusText.trim() !== (me.statusText ?? "") || bio.trim() !== me.bio;

  const pickStatus = async (value: Status) => {
    if (value === status) return;
    // Optimistic: the dot on every avatar of yours changes at once.
    onMeChange({ ...me, status: value });
    try {
      onMeChange(await save({ status: value }));
    } catch (err) {
      onMeChange(me);
      onNotify((err as Error).message);
    }
  };

  const saveText = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      onMeChange(await save({ statusText, bio }));
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Closing the popover with unsaved text keeps it rather than throwing it away.
  const latest = useRef({ dirty, statusText, bio, onMeChange, onNotify });
  useEffect(() => {
    latest.current = { dirty, statusText, bio, onMeChange, onNotify };
  });
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.dirty) save({ statusText: l.statusText, bio: l.bio }).then(l.onMeChange, (err) => l.onNotify((err as Error).message));
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar user={me} online />
        <div className="min-w-0 flex-1 leading-5">
          <p className="truncate font-semibold">{me.name}</p>
          <p className="text-xs text-muted" dir="ltr">
            {toPersianDigits(me.phone)}
          </p>
        </div>
        <button
          type="button"
          onClick={onSettings}
          aria-label="تنظیمات حساب"
          title="تنظیمات حساب"
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition hover:rotate-45 hover:bg-ink-800 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Settings className="size-5" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="وضعیت">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={status === s.value}
              onClick={() => pickStatus(s.value)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm transition-colors",
                status === s.value ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
              )}
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", s.dot)} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            className="field pe-10"
            // Empty fields have no text to guess from and fall back to LTR, which flips the Persian placeholder.
            dir={statusText ? "auto" : "rtl"}
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveText()}
            maxLength={60}
            placeholder="چه خبر؟ مثلاً «سر کارم، بعداً جواب می‌دم»"
            aria-label="متن وضعیت"
          />
          {statusText && (
            <button
              type="button"
              onClick={() => setStatusText("")}
              aria-label="پاک کردن متن وضعیت"
              className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-ink-700 hover:text-fg"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="flex justify-between text-xs text-muted">
          درباره من
          <span>
            {toPersianDigits(bio.length)}/{toPersianDigits(190)}
          </span>
        </span>
        <textarea
          className="field field-sizing-content max-h-32 min-h-16 resize-none leading-7"
          dir={bio ? "auto" : "rtl"}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={190}
          placeholder="چند کلمه دربارهٔ خودتان بنویسید"
        />
      </label>

      {dirty && (
        <button
          type="button"
          onClick={saveText}
          disabled={busy}
          className="btn-primary animate-fade-in w-full"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          ذخیره
        </button>
      )}

      {me.isAdmin && (
        <Link href="/admin" className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm transition-colors hover:bg-ink-800">
          <ShieldCheck className="size-4 text-accent" />
          پنل مدیریت
        </Link>
      )}
    </div>
  );
}

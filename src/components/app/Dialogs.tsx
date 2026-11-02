"use client";

import { useState, type FormEvent } from "react";
import { Download, Hash, Loader2, LogOut, Volume2, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useCloseOnBack, useInstallPrompt } from "@/lib/mobile";
import { toPersianDigits } from "@/lib/phone";
import { getSocket } from "@/lib/socket";
import type { ChannelDTO, ChannelType, MeDTO, ServerDTO } from "@/lib/types";
import Avatar from "./Avatar";

const inputClass =
  "w-full rounded-xl border border-white/5 bg-ink-950 px-3 py-2.5 outline-none placeholder:text-muted/60 focus:border-accent";

/** Centered on larger screens, a bottom sheet on phones. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useCloseOnBack(true, onClose);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/5 bg-ink-900 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl max-sm:border-b-0 sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="بستن" className="-m-1 rounded-md p-2 text-muted hover:bg-ink-800 hover:text-fg sm:m-0 sm:p-1">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useSubmit<T>(action: () => Promise<T>, onDone: (result: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onDone(await action());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      disabled={busy || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-strong shadow-lg shadow-accent-strong/25 px-4 py-2.5 font-semibold text-white hover:bg-accent disabled:opacity-60"
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ServerDialog({ onClose, onDone }: { onClose: () => void; onDone: (s: ServerDTO) => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [value, setValue] = useState("");
  const { busy, error, submit } = useSubmit(
    () =>
      mode === "create"
        ? api<{ server: ServerDTO }>("/api/servers", { body: { name: value } })
        : api<{ server: ServerDTO }>("/api/servers/join", { body: { code: value } }),
    (res) => onDone(res.server),
  );

  return (
    <Modal title={mode === "create" ? "ساختن سرور" : "پیوستن به سرور"} onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-ink-950 p-1 text-sm">
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setValue("");
            }}
            className={cn("rounded-full py-2 sm:py-1.5", mode === m ? "bg-accent-strong text-white" : "text-muted hover:text-fg")}
          >
            {m === "create" ? "سرور جدید" : "با لینک دعوت"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">{mode === "create" ? "نام سرور" : "لینک یا کد دعوت"}</span>
          <input
            className={inputClass}
            dir={mode === "join" ? "ltr" : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={mode === "create" ? 40 : 200}
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!value.trim()}>
          {mode === "create" ? "ساختن" : "پیوستن"}
        </SubmitButton>
      </form>
    </Modal>
  );
}

export function CreateChannelDialog({
  serverId,
  type: initialType,
  onClose,
  onDone,
}: {
  serverId: string;
  type: ChannelType;
  onClose: () => void;
  onDone: (c: ChannelDTO) => void;
}) {
  const [type, setType] = useState(initialType);
  const [name, setName] = useState("");
  const { busy, error, submit } = useSubmit(
    () => api<{ channel: ChannelDTO }>(`/api/servers/${serverId}/channels`, { body: { name, type } }),
    (res) => onDone(res.channel),
  );

  return (
    <Modal title="ساختن کانال" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          {(["text", "voice"] as const).map((t) => (
            <label
              key={t}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
                type === t ? "border-accent bg-accent-strong/10" : "border-white/5 hover:bg-ink-800",
              )}
            >
              <input type="radio" className="sr-only" checked={type === t} onChange={() => setType(t)} />
              {t === "text" ? <Hash className="size-5 text-muted" /> : <Volume2 className="size-5 text-muted" />}
              <div>
                <p className="font-semibold">{t === "text" ? "متنی" : "صوتی"}</p>
                <p className="text-xs text-muted">
                  {t === "text" ? "پیام، لینک و گفت‌وگوی نوشتاری" : "گفت‌وگوی صوتی، تصویر و اشتراک صفحه"}
                </p>
              </div>
            </label>
          ))}
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نام کانال</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!name.trim()}>
          ساختن کانال
        </SubmitButton>
      </form>
    </Modal>
  );
}

export function ProfileDialog({
  me,
  onClose,
  onDone,
  onNotify,
}: {
  me: MeDTO;
  onClose: () => void;
  onDone: (me: MeDTO) => void;
  onNotify: (message: string) => void;
}) {
  const [name, setName] = useState(me.name);
  const { canPrompt, iosManual, install } = useInstallPrompt();
  const { busy, error, submit } = useSubmit(
    () => api<{ user: MeDTO }>("/api/me", { method: "PATCH", body: { name } }),
    (res) => {
      // Reconnect so others see the new name on typing indicators.
      getSocket().disconnect().connect();
      onDone(res.user);
    },
  );

  const installApp = () => {
    if (canPrompt) install();
    else onNotify("برای نصب: در Safari دکمهٔ Share را بزنید و Add to Home Screen را انتخاب کنید");
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  };

  return (
    <Modal title="حساب کاربری" onClose={onClose}>
      <div className="mb-5 flex items-center gap-4 rounded-2xl bg-ink-950 p-4 ring-1 ring-white/5">
        <Avatar user={{ name: name || me.name, color: me.color }} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{name.trim() || me.name}</p>
          <p className="mt-0.5 text-sm text-muted" dir="ltr">
            {toPersianDigits(me.phone)}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نامی که دیگران می‌بینند</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={name.trim().length < 2 || name.trim() === me.name}>
          ذخیره
        </SubmitButton>
      </form>
      <div className="mt-5 space-y-1 border-t border-white/5 pt-4">
        {(canPrompt || iosManual) && (
          <button
            onClick={installApp}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-accent hover:bg-ink-800"
          >
            <Download className="size-4" />
            نصب برنامه روی این دستگاه
          </button>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger/10"
        >
          <LogOut className="size-4" />
          خروج از حساب
        </button>
      </div>
    </Modal>
  );
}

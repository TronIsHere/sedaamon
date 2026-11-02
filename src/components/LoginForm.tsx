"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/phone";

type Step = "phone" | "code" | "name";

const inputClass =
  "w-full rounded-xl border border-white/5 bg-ink-950 px-3 py-2.5 text-fg outline-none placeholder:text-muted/60 focus:border-accent";
const buttonClass =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-accent-strong shadow-lg shadow-accent-strong/25 px-4 py-2.5 font-semibold text-white transition hover:bg-accent disabled:opacity-60";

export default function LoginForm({ next, startWithName }: { next: string; startWithName: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startWithName ? "name" : "phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const requestCode = (e?: FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const res = await api<{ phone: string; devCode?: string }>("/api/auth/otp", { body: { phone } });
      setPhone(res.phone);
      setDevCode(res.devCode);
      setCode("");
      setStep("code");
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const res = await api<{ needsName: boolean }>("/api/auth/verify", { body: { phone, code } });
      if (res.needsName) setStep("name");
      else router.replace(next);
    });
  };

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await api("/api/me", { method: "PATCH", body: { name } });
      router.replace(next);
    });
  };

  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/5 bg-ink-900 p-6 shadow-2xl shadow-accent-strong/10">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-accent-strong/15 text-accent">
          <AudioLines className="size-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold">صدامون</h1>
          <p className="text-sm text-muted">گفت‌وگوی صوتی و تصویری با دوستان</p>
        </div>
      </div>

      {step === "phone" && (
        <form onSubmit={requestCode} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">شماره موبایل</span>
            <input
              className={inputClass}
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0912 345 6789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </label>
          <button className={buttonClass} disabled={busy || !phone.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            دریافت کد ورود
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-sm text-muted">
            کد پیامک‌شده به <span dir="ltr">{toPersianDigits(phone)}</span> را وارد کنید.
          </p>
          {devCode && (
            <p className="rounded-lg bg-ink-800 px-3 py-2 text-sm text-muted">
              حالت توسعه: کد <span className="font-mono text-accent">{devCode}</span> است.
            </p>
          )}
          <input
            className={`${inputClass} text-center text-lg tracking-[0.5em]`}
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={5}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <button className={buttonClass} disabled={busy || code.trim().length < 5}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            ورود
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-muted hover:text-fg" onClick={() => setStep("phone")}>
              تغییر شماره
            </button>
            <button type="button" className="text-accent hover:underline" onClick={() => requestCode()} disabled={busy}>
              ارسال دوباره کد
            </button>
          </div>
        </form>
      )}

      {step === "name" && (
        <form onSubmit={saveName} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">نامی که دیگران می‌بینند</span>
            <input
              className={inputClass}
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <button className={buttonClass} disabled={busy || name.trim().length < 2}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            ادامه
          </button>
        </form>
      )}

      {error && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/phone";

type Step = "phone" | "code" | "name";

const inputClass =
  "field";
const buttonClass =
  "btn-primary w-full";

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
    <div className="animate-pop-in w-full max-w-sm rounded-[2rem] bg-ink-900 p-7">
      <div className="mb-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent-strong text-on-accent">
          <AudioLines className="size-8" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">صدامون</h1>
        <p className="mt-1 text-sm text-muted">گفت‌وگوی صوتی و تصویری با دوستان</p>
      </div>

      {step === "phone" && (
        <form onSubmit={requestCode} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-muted">شماره موبایل</span>
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
            <p className="rounded-xl bg-ink-800 px-3 py-2.5 text-sm text-muted ring-1 ring-line">
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
            <button type="button" className="min-h-11 px-1 text-muted transition-colors hover:text-fg" onClick={() => setStep("phone")}>
              تغییر شماره
            </button>
            <button type="button" className="min-h-11 px-1 text-accent hover:underline disabled:opacity-50" onClick={() => requestCode()} disabled={busy}>
              ارسال دوباره کد
            </button>
          </div>
        </form>
      )}

      {step === "name" && (
        <form onSubmit={saveName} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-muted">نامی که دیگران می‌بینند</span>
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

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}
    </div>
  );
}

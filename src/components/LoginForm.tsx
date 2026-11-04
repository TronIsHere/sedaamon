"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { nationalDigits, toPersianDigits } from "@/lib/phone";
import OtpField from "@/components/ui/otp-field";
import PhoneInput from "@/components/ui/phone-input";

export type AuthMode = "login" | "signup";
type Step = "phone" | "code" | "name";

const STEPS: Step[] = ["phone", "code", "name"];
const CODE_LENGTH = 5;
const buttonClass = "btn-primary w-full sm:w-auto sm:min-w-44";

/** The wording for each step; only the first one differs between login and sign-up. */
const COPY: Record<Step, Record<AuthMode, { eyebrow: string; title: string; lead: string }>> = {
  phone: {
    login: { eyebrow: "ورود", title: "خوش برگشتید", lead: "شماره موبایلتان را بزنید تا کد ورود برایتان پیامک شود." },
    signup: { eyebrow: "ثبت‌نام", title: "به صدامون بپیوندید", lead: "با شماره موبایل حساب بسازید؛ رمز عبوری لازم نیست." },
  },
  code: {
    login: { eyebrow: "تأیید شماره", title: "کد را وارد کنید", lead: "" },
    signup: { eyebrow: "تأیید شماره", title: "کد را وارد کنید", lead: "" },
  },
  name: {
    login: { eyebrow: "پروفایل", title: "اسمتان چیست؟", lead: "این نام را دوستانتان در سرورها و تماس‌ها می‌بینند." },
    signup: { eyebrow: "پروفایل", title: "اسمتان چیست؟", lead: "این نام را دوستانتان در سرورها و تماس‌ها می‌بینند." },
  },
};

export default function LoginForm({
  mode,
  next,
  startWithName,
  switchHref,
}: {
  mode: AuthMode;
  next: string;
  startWithName: boolean;
  switchHref: string;
}) {
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

  const index = STEPS.indexOf(step);
  const copy = COPY[step][mode];

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="tabular-nums">{toPersianDigits(String(index + 1).padStart(2, "0"))}</span>
        <span aria-hidden>/</span>
        <span>{copy.eyebrow}</span>
        <span className="ms-auto flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn("h-1 rounded-full transition-all duration-300", i <= index ? "w-6 bg-accent-strong" : "w-3 bg-ink-700")}
            />
          ))}
        </span>
      </div>

      {/* Keyed so each step's heading slides in fresh. */}
      <div key={step} className="animate-drop-in">
        <h1 className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">{copy.title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted sm:text-base">
          {step === "code" ? (
            <>
              کد {toPersianDigits(CODE_LENGTH)} رقمی پیامک‌شده به <span dir="ltr">{toPersianDigits(phone)}</span> را بزنید.
            </>
          ) : (
            copy.lead
          )}
        </p>

        <div className="mt-9">
          {step === "phone" && (
            <form onSubmit={requestCode} className="space-y-6">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-muted">شماره موبایل</span>
                <PhoneInput value={phone} onChange={setPhone} autoFocus />
              </label>
              <button className={buttonClass} disabled={busy || !/^9\d{9}$/.test(nationalDigits(phone))}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                دریافت کد
                {!busy && <ArrowLeft className="size-4" />}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verify} className="space-y-6">
              {devCode && (
                <p className="rounded-xl bg-ink-800 px-3 py-2.5 text-sm text-muted ring-1 ring-line">
                  حالت توسعه: کد <span className="font-mono text-accent">{devCode}</span> است.
                </p>
              )}
              <div className="flex">
                <OtpField length={CODE_LENGTH} value={code} onChange={setCode} autoFocus />
              </div>
              <button className={buttonClass} disabled={busy || code.length < CODE_LENGTH}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "signup" ? "ساخت حساب" : "ورود"}
                {!busy && <ArrowLeft className="size-4" />}
              </button>
              <div className="flex gap-5 text-sm">
                <button
                  type="button"
                  className="min-h-11 text-muted transition-colors hover:text-fg"
                  onClick={() => setStep("phone")}
                >
                  تغییر شماره
                </button>
                <button
                  type="button"
                  className="min-h-11 text-accent hover:underline disabled:opacity-50"
                  onClick={() => requestCode()}
                  disabled={busy}
                >
                  ارسال دوباره کد
                </button>
              </div>
            </form>
          )}

          {step === "name" && (
            <form onSubmit={saveName} className="space-y-6">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-muted">نامی که دیگران می‌بینند</span>
                <input
                  className="field"
                  maxLength={32}
                  placeholder="مثلاً سارا"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </label>
              <button className={buttonClass} disabled={busy || name.trim().length < 2}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                ورود به صدامون
                {!busy && <ArrowLeft className="size-4" />}
              </button>
            </form>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}

      {step === "phone" && (
        <div className="mt-8 space-y-2 text-sm text-muted">
          <p>
            {mode === "login" ? "حساب ندارید؟ " : "قبلاً ثبت‌نام کرده‌اید؟ "}
            <Link href={switchHref} className="font-medium text-accent hover:underline">
              {mode === "login" ? "ثبت‌نام کنید" : "وارد شوید"}
            </Link>
          </p>
          <p className="flex items-center gap-1.5 text-xs">
            <Info aria-hidden className="size-3.5 shrink-0" />
            ورود و ثبت‌نام هر دو فقط با یک کد پیامکی انجام می‌شود.
          </p>
        </div>
      )}
    </div>
  );
}

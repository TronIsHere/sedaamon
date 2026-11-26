"use client";

/**
 * «کارت به کارت», adapted from the VibeFarsi registry (card-to-card): the payee's card drawn in its bank's colours
 * (picked from the first six digits), the holder's name to check in the banking app, and one-tap copy for the card
 * number and the amount. Copies Latin digits, which every bank app accepts. The card face uses each bank's own
 * colours so it is recognisable; the panel around it uses the project's tokens.
 */

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/format";
import { toLatinDigits, toPersianDigits } from "@/lib/phone";
import { formatToman } from "@/lib/store";

/** 16 Latin digits at most; Persian digits, spaces and dashes are stripped. */
export const normalizeCardNumber = (input: string) => toLatinDigits(input).replace(/\D/g, "").slice(0, 16);

/** First six digits (BIN) of Iranian bank cards. Merged banks now issue under سپه. */
const CARD_BINS: Record<string, string> = {
  "603799": "ملی", "589210": "سپه", "627381": "سپه", "639599": "سپه", "636949": "سپه", "639370": "سپه", "505801": "سپه",
  "627648": "توسعه صادرات", "207177": "توسعه صادرات", "627961": "صنعت و معدن", "603770": "کشاورزی", "639217": "کشاورزی",
  "628023": "مسکن", "627760": "پست بانک", "502908": "توسعه تعاون", "627412": "اقتصاد نوین", "622106": "پارسیان", "639194": "پارسیان",
  "627884": "پارسیان", "502229": "پاسارگاد", "639347": "پاسارگاد", "627488": "کارآفرین", "502910": "کارآفرین", "621986": "سامان",
  "639346": "سینا", "639607": "سرمایه", "636214": "آینده", "502806": "شهر", "504706": "شهر", "502938": "دی", "603769": "صادرات",
  "610433": "ملت", "991975": "ملت", "627353": "تجارت", "585983": "تجارت", "589463": "رفاه کارگران", "504172": "رسالت",
  "606373": "قرض‌الحسنه مهر ایران", "505785": "ایران زمین", "585947": "خاورمیانه",
};

export const cardBank = (input: string) => {
  const d = normalizeCardNumber(input);
  return d.length < 6 ? null : (CARD_BINS[d.slice(0, 6)] ?? null);
};

/** «ملت» → «بانک ملت»; names that already say بانک or مؤسسه are left alone. */
const bankLabel = (name: string) => (/بانک|مؤسسه/.test(name) ? name : `بانک ${name}`);

type Pattern = "rings" | "arc" | "diagonal" | "waves" | "orbs" | "grid" | "sparkle";
type Art = "mellat" | "damavand" | "clouds" | "wedge" | "lines";

interface BankCardStyle {
  background: string;
  ink: string;
  accent: string;
  pattern?: Pattern;
  art?: Art;
  lift?: boolean;
}

const g = (from: string, via: string, to: string) => `linear-gradient(135deg, ${from}, ${via} 55%, ${to})`;

const BANK_CARD_STYLES: Record<string, BankCardStyle> = {
  "ملی": { background: "linear-gradient(180deg, #2a64b8, #6ea8e0 48%, #c4def2 70%)", ink: "#ffffff", accent: "#0b2a6b", art: "damavand", lift: true },
  "ملت": { background: "linear-gradient(135deg, #efe1b0, #cfb67c 50%, #ebdaa6)", ink: "#1c1410", accent: "#c8102e", pattern: "sparkle", art: "mellat" },
  "تجارت": { background: "radial-gradient(120% 95% at 60% 40%, #4189d8, #1d5bb0 55%, #0e3a7d)", ink: "#ffffff", accent: "#ffffff" },
  "پاسارگاد": { background: "linear-gradient(135deg, #222, #0c0c0c 55%, #000)", ink: "#f3e2ad", accent: "#e2bf62", art: "wedge" },
  "شهر": { background: g("#e01b22", "#c9141b", "#a50f15"), ink: "#ffffff", accent: "#ffffff", art: "lines" },
  "رسالت": { background: "linear-gradient(170deg, #2f86d4, #86c0ec 42%, #eef6fd 72%)", ink: "#0e1b2c", accent: "#11508f", art: "clouds" },
  "صادرات": { background: g("#14246b", "#2643a3", "#0d184a"), ink: "#ffffff", accent: "#7cc8f2", pattern: "diagonal" },
  "سپه": { background: g("#f2a900", "#ffd043", "#e08e00"), ink: "#0d2557", accent: "#0d2557", pattern: "rings" },
  "سامان": { background: g("#0089c2", "#22b2e6", "#006f9f"), ink: "#ffffff", accent: "#ffffff", pattern: "waves" },
  "پارسیان": { background: g("#6f1230", "#a3203f", "#4f0c22"), ink: "#f3dfb1", accent: "#f3dfb1", pattern: "orbs" },
  "کشاورزی": { background: g("#00693a", "#109a50", "#004f2b"), ink: "#ffffff", accent: "#f4d03f", pattern: "waves" },
  "مسکن": { background: g("#e05a08", "#f7892c", "#bf4a04"), ink: "#ffffff", accent: "#ffffff", pattern: "arc" },
  "دی": { background: g("#00797a", "#00a7a2", "#005a5b"), ink: "#ffffff", accent: "#ffffff", pattern: "orbs" },
  "آینده": { background: g("#55201a", "#8a3424", "#3c1410"), ink: "#f7c873", accent: "#f7c873", pattern: "rings" },
  "اقتصاد نوین": { background: g("#4b1f7a", "#6d34a8", "#341456"), ink: "#ffffff", accent: "#e9c6ff", pattern: "diagonal" },
  "سینا": { background: g("#003f7f", "#0062b2", "#002c5a"), ink: "#ffffff", accent: "#9fd3ff", pattern: "grid" },
  "کارآفرین": { background: g("#0b6b5e", "#159c87", "#07483f"), ink: "#ffffff", accent: "#c9f2e8", pattern: "arc" },
  "پست بانک": { background: g("#087a3c", "#16a352", "#05592b"), ink: "#ffffff", accent: "#ffd200", pattern: "diagonal" },
  "سرمایه": { background: g("#3a2a6b", "#5a46a0", "#271b4d"), ink: "#ffffff", accent: "#d7cdff", pattern: "grid" },
  "قرض‌الحسنه مهر ایران": { background: g("#0b7b3e", "#22a05a", "#075a2d"), ink: "#ffffff", accent: "#ffffff", pattern: "rings" },
};

const DEFAULT_CARD_STYLE: BankCardStyle = { background: g("#1f2937", "#3b4453", "#111827"), ink: "#ffffff", accent: "#cbd5e1", pattern: "grid" };

const tint = (pct: number) => `color-mix(in oklab, currentColor ${pct}%, transparent)`;
const PATTERNS: Record<Pattern, string> = {
  rings: `repeating-radial-gradient(circle at 0% 100%, ${tint(9)} 0 1px, transparent 1px 16px)`,
  arc: `radial-gradient(circle at 0% 50%, transparent 44%, ${tint(12)} 44% 52%, transparent 52% 60%, ${tint(7)} 60% 64%, transparent 64%)`,
  diagonal: `repeating-linear-gradient(45deg, ${tint(7)} 0 2px, transparent 2px 13px)`,
  waves: `radial-gradient(120% 70% at 0% 110%, ${tint(16)}, transparent 60%), radial-gradient(80% 60% at 100% -10%, ${tint(10)}, transparent 60%)`,
  orbs: `radial-gradient(circle at 8% 88%, ${tint(16)} 0 22%, transparent 22.5%), radial-gradient(circle at 26% 105%, ${tint(10)} 0 26%, transparent 26.5%)`,
  grid: `linear-gradient(${tint(6)} 1px, transparent 1px) 0 0 / 18px 18px, linear-gradient(90deg, ${tint(6)} 1px, transparent 1px) 0 0 / 18px 18px`,
  sparkle: `radial-gradient(rgb(255 255 255 / 0.5) 0.6px, transparent 1px) 0 0 / 7px 7px, radial-gradient(rgb(120 90 30 / 0.25) 0.6px, transparent 1px) 3px 4px / 9px 9px`,
};

/** Motifs on a 856×540 canvas (the card in tenths of a millimetre). */
function CardArt({ art }: { art: Art }) {
  const id = useId();
  const svg = (children: ReactNode) => (
    <svg aria-hidden viewBox="0 0 856 540" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 -z-10 size-full">
      {children}
    </svg>
  );
  switch (art) {
    case "mellat":
      return svg(
        <>
          <path d="M60 540C20 390 110 210 290 100 380 45 470 15 570 0h150C570 70 470 175 440 300c-24 100 6 180 56 240Z" fill="#c8102e" />
          <path d="M496 540c-50-60-80-140-56-240 16-64 46-118 86-162-24 96-20 250 76 402Z" fill="#8c0a1f" />
        </>,
      );
    case "damavand":
      return svg(
        <>
          <defs>
            <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7d93ad" />
              <stop offset="1" stopColor="#3f5876" />
            </linearGradient>
          </defs>
          <path d="M0 390l170-70 160-120 90-52 50 22 90 70 140 60 156 46v194H0Z" fill={`url(#${id}r)`} />
          <path d="M330 200l90-52 50 22 90 70-42-6-38 22-34-30-46 26-30-24-40 18Z" fill="#f5f9fd" />
          <path d="M0 425c200-50 380-10 520-30s260-15 336-25v170H0Z" fill="#2f6b2a" />
        </>,
      );
    case "clouds":
      return svg(
        <>
          <defs>
            <filter id={`${id}b`}>
              <feGaussianBlur stdDeviation="14" />
            </filter>
          </defs>
          <g fill="#fff" filter={`url(#${id}b)`}>
            <ellipse cx="140" cy="150" rx="170" ry="48" opacity=".9" />
            <ellipse cx="720" cy="230" rx="200" ry="60" opacity=".8" />
            <ellipse cx="640" cy="440" rx="320" ry="90" />
          </g>
        </>,
      );
    case "wedge":
      return svg(
        <>
          <path d="M0 300l70 40-70 40Z" fill="#c8102e" />
          <path d="M520 0C640 120 700 330 856 400V0Z" fill="#fff" opacity=".04" />
        </>,
      );
    case "lines":
      return svg(
        <g stroke="#fff" strokeOpacity=".12" strokeWidth="2" fill="none">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M0 ${250 + i * 26}C200 ${190 + i * 26} 420 ${330 + i * 22} 856 ${200 + i * 30}`} />
          ))}
        </g>,
      );
  }
}

function Chip() {
  const id = useId();
  return (
    <svg aria-hidden viewBox="0 0 48 36" className="w-[12cqw]">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c7d2e2" />
          <stop offset=".45" stopColor="#f5f8fc" />
          <stop offset="1" stopColor="#8e9fb6" />
        </linearGradient>
      </defs>
      <rect x=".5" y=".5" width="47" height="35" rx="6" fill={`url(#${id})`} stroke="#6b7c93" strokeOpacity=".5" />
      <path d="M16 1v34M32 1v34M1 12h15M1 24h15M32 12h15M32 24h15M16 18h16" stroke="#6b7c93" strokeOpacity=".55" fill="none" />
    </svg>
  );
}

/** A bank card face in the look of the bank's real card. Sizes itself to its container (ID-1 ratio). */
export function BankCard({ number, holder, className }: { number: string; holder?: string; className?: string }) {
  const digits = normalizeCardNumber(number);
  const name = cardBank(digits);
  const look = (name && BANK_CARD_STYLES[name]) || DEFAULT_CARD_STYLE;
  const groups = toPersianDigits(digits.padEnd(16, "•")).match(/.{4}/g) ?? [];

  return (
    <div
      dir="rtl"
      role="img"
      aria-label={`${name ? bankLabel(name) : "کارت بانکی"}، شمارهٔ ${toPersianDigits(digits)}${holder ? `، به نام ${holder}` : ""}`}
      className={cn("@container relative isolate aspect-[1.586/1] w-full select-none overflow-hidden rounded-[3.7%/5.9%] shadow-lg", className)}
      style={{ background: look.background, color: look.ink }}
    >
      {look.pattern && <div aria-hidden className="absolute inset-0 -z-10" style={{ background: PATTERNS[look.pattern] }} />}
      {look.art && <CardArt art={look.art} />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.16)_48%,transparent_60%)]" />
      <div
        aria-hidden
        className="absolute inset-0 flex flex-col px-[7cqw] pt-[6.5cqw] pb-[6cqw]"
        style={look.lift ? { textShadow: "0 1px 3px rgb(0 0 0 / 0.45)" } : undefined}
      >
        <div className="self-start text-[5.6cqw] leading-none font-bold" style={{ color: look.accent, textShadow: "none" }}>
          {name ? bankLabel(name) : "کارت بانکی"}
        </div>
        <div className="mt-[5cqw] self-end">
          <Chip />
        </div>
        <div className="mt-auto space-y-[2.2cqw]">
          <div dir="ltr" className="flex justify-between text-[7.2cqw] leading-none font-bold tabular-nums">
            {groups.map((part, i) => (
              <span key={i}>{part}</span>
            ))}
          </div>
          <span className="block min-w-0 truncate text-[3.8cqw] leading-tight font-bold">{holder || " "}</span>
        </div>
      </div>
    </div>
  );
}

type Field = "card" | "amount";

/** The card, a reminder to check the holder's name, and copy buttons for the amount and the card number. */
export function CardToCard({ number, holder, amount, className }: { number: string; holder: string; amount?: number; className?: string }) {
  const [copied, setCopied] = useState<Field | null>(null);
  const digits = normalizeCardNumber(number);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (field: Field, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
    } catch {
      // The clipboard can be blocked (insecure origin); the numbers stay selectable.
    }
  };
  const mark = (field: Field) => (copied === field ? <Check className="size-4 text-online" /> : <Copy className="size-4" />);

  return (
    <div dir="rtl" className={cn("w-full space-y-3", className)}>
      <BankCard number={digits} holder={holder} className="mx-auto max-w-sm" />
      <p className="flex items-start gap-2 text-xs leading-6 text-muted">
        <ShieldCheck className="mt-1 size-4 shrink-0 text-online" />
        <span>
          پیش از تأیید انتقال، مطمئن شوید اپ بانک نام <b className="font-bold text-fg">{holder}</b> را نشان می‌دهد.
        </span>
      </p>
      {amount !== undefined && (
        <div className="flex items-center gap-3 rounded-xl bg-ink-850 py-1.5 ps-3 pe-1.5 ring-1 ring-line">
          <span className="shrink-0 text-xs text-muted">مبلغ دقیق</span>
          <span className="min-w-0 flex-1 truncate text-end text-lg font-bold tabular-nums text-accent select-all">{formatToman(amount)}</span>
          <button
            type="button"
            onClick={() => copy("amount", String(amount))}
            aria-label={copied === "amount" ? "مبلغ کپی شد" : "کپی مبلغ"}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-ink-700 hover:text-fg"
          >
            {mark("amount")}
          </button>
        </div>
      )}
      <button type="button" className="btn-primary w-full" onClick={() => copy("card", digits)} disabled={digits.length !== 16}>
        {mark("card")}
        {copied === "card" ? "شمارهٔ کارت کپی شد" : "کپی شمارهٔ کارت"}
      </button>
    </div>
  );
}

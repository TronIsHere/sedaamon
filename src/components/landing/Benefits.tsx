import type { CSSProperties, ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import {
  CalendarDays,
  Check,
  Crown,
  Gavel,
  Hash,
  Mic,
  MonitorUp,
  Pause,
  Plus,
  Shield,
  Sticker,
  Users,
} from "lucide-react";
import LowDataDemo from "./LowDataDemo";

const SPEAKERS = [
  { name: "سارا", lo: "38%", hi: "82%", t: "1.9s" },
  { name: "امید", lo: "20%", hi: "64%", t: "2.6s" },
  { name: "نگار", lo: "46%", hi: "70%", t: "2.2s" },
  { name: "کاوه", lo: "12%", hi: "40%", t: "3.1s" },
  { name: "مهسا", lo: "28%", hi: "55%", t: "2.8s" },
];

const SOURCES = [
  { label: "امشب کی پایه‌ی بازیه؟", icon: Hash },
  { label: "بیاید لابی، صدام میاد؟", icon: Mic },
  { label: "صفحه‌م رو می‌بینید؟", icon: MonitorUp },
];

/** The "what you get" bento: six cards of unequal width, each a small drawn scene over a title and a line. */
export default function Benefits() {
  return (
    <section id="features" className="scroll-mt-24 px-4 pt-28 sm:px-6 sm:pt-36">
      <p className="landing-reveal text-center text-xs font-bold text-(--muted)">
        امکانات صدامون
      </p>
      <h2 className="landing-reveal mx-auto mt-4 max-w-3xl text-center text-3xl leading-[1.35] font-medium text-balance sm:text-5xl">
        <span className="text-(--lime)">حرف بزنید</span>،{" "}
        <span className="text-(--lime)">ببینید</span> و{" "}
        <span className="text-(--lime)">دور هم</span> بمانید
      </h2>
      <p className="landing-reveal mx-auto mt-4 max-w-xl text-center leading-8 text-(--muted)">
        پیام، صدا و تصویر کنار هم در یک سرور. جمعتان سرپا می‌ماند، حتی وقتی
        اینترنت نمی‌ماند.
      </p>

      <ul className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Cell
          span="sm:col-span-2 lg:col-span-4"
          title="همه‌ی گفت‌وگوها در یک سرور"
          text="کانال متنی، کانال صوتی و اشتراک صفحه کنار هم‌اند؛ لازم نیست جمعتان بین چند برنامه پخش شود."
        >
          <HubScene />
        </Cell>
        <Cell
          span="lg:col-span-2"
          title="پیام، استیکر و پیام صوتی"
          text="جواب بدهید، استیکر بفرستید یا یک پیام صوتی کوتاه ضبط کنید."
        >
          <ChatScene />
        </Cell>
        <Cell
          span="lg:col-span-3"
          title="چه کسی حرف می‌زند؟"
          text="در هر کانال صوتی می‌بینید چه کسانی هستند و صدای کدامشان بلندتر است."
        >
          <SpeakersScene />
        </Cell>
        <Cell
          span="sm:col-span-2 lg:col-span-3"
          title="حالت کم‌مصرف"
          text="با اینترنت کند، تصویر را کنار بگذارید و صدا را نگه دارید. یکی از دو حالت را امتحان کنید."
          scene="p-4 sm:p-5"
        >
          <LowDataDemo />
        </Cell>
        <Cell
          span="lg:col-span-2"
          title="تماشای هم‌زمان"
          text="هر نفر فایل خودش را پخش می‌کند و فقط فرمان پخش و توقف رد و بدل می‌شود."
        >
          <WatchScene />
        </Cell>
        <Cell
          span="lg:col-span-2"
          title="رویدادها با تقویم شمسی"
          text="شب بازی یا کلاس بعدی را اعلام کنید تا اعضا یادشان بماند."
        >
          <EventScene />
        </Cell>
        <Cell
          span="sm:col-span-2 lg:col-span-2"
          title="نقش‌ها و مدیریت"
          text="مالک، مدیر و ناظر تعیین کنید تا نظم سرور دست چند نفر باشد."
        >
          <RolesScene />
        </Cell>
      </ul>
    </section>
  );
}

function Cell({
  span,
  title,
  text,
  scene = "h-56 px-5 pt-5",
  children,
}: {
  span: string;
  title: string;
  text: string;
  scene?: string;
  children: ReactNode;
}) {
  return (
    <li
      className={`landing-reveal flex flex-col overflow-hidden rounded-[1.75rem] bg-(--soft) ring-1 ring-(--hair) ${span}`}
    >
      {/* Scenes show sample names and chat lines, not real content, so they stay out of search snippets. */}
      <div
        className={`landing-scene relative flex flex-1 items-center justify-center overflow-hidden ${scene}`}
        data-nosnippet
      >
        {children}
      </div>
      <div className="px-5 pt-4 pb-6 sm:px-6">
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1.5 text-sm leading-7 text-pretty text-(--muted)">
          {text}
        </p>
      </div>
    </li>
  );
}

function Pill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-xl bg-(--raised) px-3 py-2 text-xs whitespace-nowrap ring-1 ring-(--hair) ${className}`}
    >
      {children}
    </span>
  );
}

/** Three kinds of talk flowing along lines into one sedaamon server. */
function HubScene() {
  return (
    <div className="grid w-full max-w-xl grid-cols-[auto_1fr_auto] items-center" aria-hidden>
      <ul className="flex flex-col gap-5">
        {SOURCES.map(({ label, icon: Icon }) => (
          <li key={label} className="flex items-center gap-2">
            <Pill className="hidden sm:block">{label}</Pill>
            <span className="grid size-9 place-items-center rounded-full bg-(--raised-2) text-(--lime) ring-4 ring-(--soft)">
              <Icon className="size-4" />
            </span>
          </li>
        ))}
      </ul>
      <svg
        viewBox="0 0 100 120"
        preserveAspectRatio="none"
        className="h-36 w-full"
      >
        {["M100 15 C50 15 50 60 0 60", "M100 60 L0 60", "M100 105 C50 105 50 60 0 60"].map(
          (d, i) => (
            <g key={d}>
              <path d={d} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <path
                d={d}
                fill="none"
                stroke="var(--lime)"
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                pathLength={100}
                className="landing-beam"
                style={{ "--d": `${i * 0.6}s` } as CSSProperties}
              />
            </g>
          ),
        )}
      </svg>
      <span className="relative grid size-20 place-items-center rounded-3xl bg-(--raised) shadow-2xl ring-1 ring-white/10">
        <BrandMark className="size-11" radius={140} />
        <span className="landing-speaking absolute inset-0 rounded-3xl" />
      </span>
    </div>
  );
}

function ChatScene() {
  return (
    <div className="flex w-full max-w-64 flex-col gap-2 self-end" aria-hidden>
      <div className="flex items-end gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--raised-2) text-xs font-bold">
          ک
        </span>
        <Pill className="rounded-es-sm whitespace-normal">
          کسی پایه‌ی فیلم امشب هست؟
        </Pill>
      </div>
      <p className="pe-1 text-end text-[11px] text-(--muted)">۲۱:۱۲</p>
      <div className="relative ms-10 rounded-2xl rounded-ee-sm bg-(--lime) p-3 text-xs leading-6 text-(--ink)">
        من هستم! لینک تماشای هم‌زمان رو بفرست
        <span className="mt-2 flex gap-1.5">
          {["🍿", "🎬", "😍"].map((s) => (
            <span key={s} className="grid size-8 place-items-center rounded-lg bg-black/10 text-base">
              {s}
            </span>
          ))}
        </span>
        <span className="absolute -top-3 -end-3 grid size-8 place-items-center rounded-full bg-(--fg) text-(--ink) shadow-lg">
          <Sticker className="size-4" />
        </span>
      </div>
    </div>
  );
}

function SpeakersScene() {
  return (
    <ul className="flex w-full flex-col gap-2.5 self-end rounded-t-2xl bg-(--raised) p-4 pb-6" aria-hidden>
      {SPEAKERS.map((p) => (
        <li key={p.name} className="flex items-center gap-3">
          <span className="w-10 text-sm">{p.name}</span>
          <div className="h-6 flex-1">
            <div
              className="landing-level flex h-full items-center rounded-md bg-linear-to-l from-(--lime-strong) to-(--lime) px-2"
              style={{ "--lo": p.lo, "--hi": p.hi, "--t": p.t } as CSSProperties}
            >
              <Mic className="size-3.5 text-(--ink)" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function WatchScene() {
  return (
    <div className="relative w-full max-w-64" aria-hidden>
      <div className="rotate-3 rounded-2xl bg-(--raised) p-3 shadow-2xl ring-1 ring-white/10">
        <div className="relative grid aspect-video place-items-center rounded-xl bg-linear-to-br from-(--raised-2) to-(--canvas)">
          <span className="grid size-10 place-items-center rounded-full bg-(--fg) text-(--ink)">
            <Pause className="size-4 fill-current" />
          </span>
          <span className="absolute start-2 top-2 flex items-center gap-1 rounded-full bg-(--lime) px-2 py-0.5 text-[11px] font-bold text-(--ink)">
            <Check className="size-3" />
            هماهنگ
          </span>
        </div>
        <div className="mt-3 h-1 rounded-full bg-white/10">
          <div className="h-full w-[62%] rounded-full bg-(--lime)" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-(--muted)">
          <span className="flex -space-x-2 space-x-reverse">
            {["س", "ا", "ن", "ک"].map((n) => (
              <span key={n} className="grid size-6 place-items-center rounded-full bg-(--raised-2) text-[10px] font-bold text-(--fg) ring-2 ring-(--raised)">
                {n}
              </span>
            ))}
          </span>
          ۱:۰۴:۱۰
        </div>
      </div>
    </div>
  );
}

function EventScene() {
  return (
    <div className="relative h-full w-full max-w-64" aria-hidden>
      <div className="absolute inset-x-6 top-10 h-28 -rotate-6 rounded-2xl bg-(--raised-2)/60" />
      <div className="absolute inset-x-0 top-6 rotate-2 rounded-2xl bg-(--fg) p-4 text-(--ink) shadow-2xl">
        <span className="flex items-center gap-1.5 text-xs text-black/55">
          <CalendarDays className="size-3.5" />
          رویداد بعدی
        </span>
        <p className="mt-2 text-lg font-bold">شب بازی هفتگی</p>
        <p className="text-sm">پنج‌شنبه ۱۵ آبان · ساعت ۲۲</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1 rounded-full bg-(--lime) px-2.5 py-1 text-xs font-bold">
            <Users className="size-3.5" />
            ۱۸ نفر می‌آیند
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-(--ink) text-(--fg)">
            <Plus className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

function RolesScene() {
  return (
    <div className="flex w-full max-w-64 flex-col items-center" aria-hidden>
      <Pill className="flex items-center gap-1.5 ring-amber-400/30">
        <Crown className="size-3.5 text-amber-400" />
        مالک سرور
      </Pill>
      <span className="h-5 w-px bg-white/15" />
      <span className="h-px w-1/2 bg-white/15" />
      <div className="grid w-full grid-cols-2">
        {[
          { label: "مدیر", icon: Shield, tone: "text-sky-400" },
          { label: "ناظر", icon: Gavel, tone: "text-violet-400" },
        ].map(({ label, icon: Icon, tone }) => (
          <div key={label} className="flex flex-col items-center">
            <span className="h-5 w-px bg-white/15" />
            <Pill className="flex items-center gap-1.5">
              <Icon className={`size-3.5 ${tone}`} />
              {label}
            </Pill>
          </div>
        ))}
      </div>
      <span className="mt-4 flex items-center gap-1.5 rounded-full bg-(--lime) px-3 py-1.5 text-xs font-bold text-(--ink)">
        <Users className="size-3.5" />
        ۲۴ عضو
      </span>
    </div>
  );
}

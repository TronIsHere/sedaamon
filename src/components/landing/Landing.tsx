import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowUpLeft,
  AudioLines,
  CalendarDays,
  Clapperboard,
  Hash,
  Headphones,
  Link2,
  Mic,
  MonitorUp,
  PhoneOff,
  Plus,
  Quote,
  Server,
  Users,
  Video,
} from "lucide-react";
import LowDataDemo from "./LowDataDemo";
import "./landing.css";

const NAV = [
  { href: "#features", label: "امکانات" },
  { href: "#how", label: "شروع کار" },
  { href: "#why", label: "چرا صدامون" },
  { href: "#faq", label: "پرسش‌ها" },
];

const MARQUEE = [
  "تماس صوتی",
  "تماس تصویری",
  "اشتراک صفحه",
  "تماشای هم‌زمان",
  "استیکر",
  "رویدادها",
  "پیام سنجاق‌شده",
  "نقش‌ها",
  "کشف سرورها",
];

const SPEAKERS = [
  { name: "سارا", lo: "38%", hi: "82%", t: "1.9s" },
  { name: "امید", lo: "20%", hi: "64%", t: "2.6s" },
  { name: "نگار", lo: "46%", hi: "70%", t: "2.2s" },
  { name: "کاوه", lo: "12%", hi: "40%", t: "3.1s" },
  { name: "مهسا", lo: "28%", hi: "55%", t: "2.8s" },
  { name: "آرش", lo: "10%", hi: "26%", t: "3.4s" },
];

const STEPS = [
  {
    title: "یک سرور بسازید",
    text: "برای جمعتان کانال متنی و صوتی جدا بسازید.",
    tag: "سرور و کانال",
    color: "bg-(--raised-2) text-(--fg)",
    icon: Hash,
  },
  {
    title: "دوستانتان را دعوت کنید",
    text: "لینک دعوت را بفرستید؛ ورود فقط با شماره‌ی موبایل است.",
    tag: "لینک دعوت",
    color: "bg-(--raised) text-(--fg)",
    icon: Users,
  },
  {
    title: "وارد کانال صوتی شوید",
    text: "حرف بزنید، دوربین را روشن کنید یا صفحه‌تان را نشان دهید.",
    tag: "صدا و تصویر",
    color: "bg-(--lime) text-(--ink)",
    icon: Headphones,
  },
];

const FACTS = [
  {
    big: "۱ لینک",
    tag: "دعوت",
    text: "یک لینک دعوت کافی است. هر کس آن را باز کند، با شماره‌ی موبایلش وارد می‌شود و به سرور شما می‌پیوندد.",
    icon: Link2,
    tile: "from-(--raised) to-(--soft)",
    accent: "text-(--lime)",
  },
  {
    big: "چند بایت",
    tag: "تماشای هم‌زمان",
    text: "در تماشای هم‌زمان، هر نفر نسخه‌ی خودش از فایل را پخش می‌کند و فقط فرمان پخش، توقف و جابه‌جایی بین شما رد و بدل می‌شود. برای همین با اینترنت ضعیف هم هماهنگ می‌مانید.",
    icon: Clapperboard,
    tile: "from-(--raised-2) to-(--raised)",
    accent: "text-(--fg)",
  },
  {
    big: "۱۰۰٪ فارسی",
    tag: "راست‌چین",
    text: "رابط از اول راست‌چین ساخته شده، تاریخ‌ها شمسی‌اند و رویدادهای سرور را با تقویم شمسی برنامه‌ریزی می‌کنید.",
    icon: CalendarDays,
    tile: "from-(--lime) to-(--lime-strong)",
    accent: "text-(--ink)",
  },
];

const USES = [
  {
    text: "شب‌های بازی را در کانال صوتی می‌گذرانید، یک نفر صفحه‌ی بازی‌اش را به اشتراک می‌گذارد و بقیه هم‌زمان می‌بینند.",
    who: "جمع‌های بازی",
    what: "کانال صوتی و اشتراک صفحه",
  },
  {
    text: "کلاس را در کانال تصویری برگزار کنید، جلسه‌ی بعد را در بخش رویدادها اعلام کنید و جزوه‌ها را بالای کانال سنجاق کنید.",
    who: "کلاس‌ها و گروه‌های مطالعه",
    what: "رویدادها و پیام‌های سنجاق‌شده",
  },
  {
    text: "برای هم استیکر بفرستید، فیلم آخر هفته را با هم تماشا کنید و هر وقت حوصله داشتید، سری به کانال صوتی بزنید.",
    who: "دوستان و خانواده",
    what: "استیکر و تماشای هم‌زمان",
  },
];

const FAQ = [
  {
    q: "برای استفاده از صدامون فیلترشکن لازم است؟",
    a: "نه. صدامون روی سرورهای داخل ایران اجرا می‌شود. ورود، پیام‌ها، صدا و تصویر و حتی فونت‌ها و آیکون‌ها همه از همان سرور می‌آیند، پس با قطع اینترنت بین‌الملل هم کار می‌کند.",
  },
  {
    q: "چطور حساب بسازم؟",
    a: "شماره‌ی موبایلتان را وارد کنید تا یک کد پیامکی برایتان بیاید. بعد از واردکردن کد، فقط یک نام انتخاب می‌کنید و آماده‌اید.",
  },
  {
    q: "اگر اینترنتم ضعیف باشد چه می‌شود؟",
    a: "حالت کم‌مصرف را روشن کنید. در این حالت تصویر دیگران دریافت نمی‌شود و صدا بدون قطعی ادامه پیدا می‌کند.",
  },
  {
    q: "روی موبایل هم کار می‌کند؟",
    a: "بله. صدامون در مرورگر موبایل باز می‌شود و می‌توانید آن را به صفحه‌ی اصلی گوشی اضافه کنید تا مثل یک برنامه اجرا شود.",
  },
  {
    q: "چه کسی می‌تواند کانال بسازد یا عضوی را بیرون کند؟",
    a: "هر سرور یک مالک دارد. مالک مدیر تعیین می‌کند و مدیرها کانال‌ها را می‌سازند، پیام پاک می‌کنند و اعضای پایین‌تر از خودشان را بی‌صدا یا اخراج می‌کنند.",
  },
  {
    q: "سرورهای عمومی را کجا پیدا کنم؟",
    a: "در بخش کشف سرورها، سرورهای عمومی بر اساس دسته‌هایی مثل بازی، موسیقی و آموزش فهرست شده‌اند و با یک کلیک عضو می‌شوید.",
  },
];

export default function Landing() {
  return (
    <div className={`landing-root min-h-full`}>
      <Header />
      <main>
        <Hero />
        <Features />
        <Steps />
        <Statement />
        <Facts />
        <Uses />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

/* ---- Pieces ----------------------------------------------------------------------------------- */

function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-lg"
      aria-label="صدامون"
    >
      <svg viewBox="0 0 512 512" className="size-8" aria-hidden>
        <rect width="512" height="512" rx="112" fill="#e6f7a3" />
        <g stroke="#0b0b0b" strokeWidth="40" strokeLinecap="round">
          <path d="M136 226v60M196 176v160M256 116v280M316 196v120M376 156v200" />
        </g>
      </svg>
      <span className="text-xl font-extrabold">صدامون</span>
    </Link>
  );
}

function PrimaryButton({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href="/login"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-(--lime-strong) px-6 font-bold text-(--ink) shadow-glow transition hover:brightness-105 active:scale-[0.98] ${className}`}
    >
      {children}
    </Link>
  );
}

function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`mx-auto max-w-2xl text-center text-3xl leading-[1.35] font-medium text-balance sm:text-5xl ${className}`}
    >
      {children}
    </h2>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 bg-(--canvas)/85 pt-safe backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
        <Logo />
        <nav
          aria-label="بخش‌های صفحه"
          className="hidden items-center gap-1 rounded-xl bg-(--soft) p-1 text-sm md:flex"
        >
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-4 py-2 transition-colors hover:bg-(--raised)"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-sm sm:gap-4">
          <Link
            href="/login"
            className="rounded-lg px-2 py-2 hover:text-(--lime)"
          >
            ورود
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-(--lime-strong) px-4 py-2.5 font-bold text-(--ink) transition hover:brightness-105 active:scale-[0.98]"
          >
            شروع کنید
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="px-4 pt-14 sm:px-6 sm:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl leading-[1.3] font-medium text-balance sm:text-6xl lg:text-7xl">
          دور هم باشید،
          <br />
          هر جا که هستید
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-pretty text-(--muted) sm:text-lg">
          سرورهای صوتی، تصویری و متنی برای دوستان، کلاس‌ها و جمع‌های بازی.
          همه‌چیز روی شبکه‌ی داخلی اجرا می‌شود، پس با قطع اینترنت بین‌الملل هم
          صدای هم را می‌شنوید.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryButton className="w-full sm:w-auto">
            همین حالا شروع کنید
          </PrimaryButton>
          <Link
            href="/login"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-(--hair) px-6 font-medium transition hover:border-(--lime) hover:text-(--lime) sm:w-auto"
          >
            ورود به حساب
          </Link>
        </div>
      </div>

      <div
        className={`landing-stack relative mx-auto mt-16 h-[22rem] max-w-5xl sm:mt-20 sm:h-[30rem]`}
      >
        <div
          className={`landing-card-lime absolute inset-x-[3%] top-6 bottom-0 rounded-[2rem] bg-(--lime) sm:rounded-[2.75rem]`}
        />
        <div
          className={`landing-card-mid absolute inset-x-[2%] top-6 bottom-0 rounded-[2rem] bg-(--raised-2) sm:rounded-[2.75rem]`}
        />
        <div
          className={`landing-card-front absolute inset-x-0 top-6 bottom-0 overflow-hidden rounded-[2rem] bg-(--soft) ring-1 ring-(--hair) sm:rounded-[2.75rem]`}
        >
          <VoiceRoomArt />
        </div>
      </div>
    </section>
  );
}

/** The illustration on the front card: a voice room drawn as planets, rings and a call bar. */
function VoiceRoomArt() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_80%_20%,rgb(230_247_163/0.14),transparent_60%),radial-gradient(50%_60%_at_10%_100%,rgb(255_255_255/0.06),transparent_70%)]" />

      {/* Orbits and the planet */}
      <div className="absolute start-[8%] top-1/2 size-[19rem] -translate-y-1/2 rounded-full border border-white/15 sm:size-[26rem]" />
      <div className="absolute start-[15%] top-1/2 size-[12rem] -translate-y-1/2 rounded-full border border-white/10 sm:size-[17rem]" />
      <div
        className={`landing-sphere landing-float-slow absolute start-[22%] top-1/2 -mt-14 size-28 rounded-full sm:-mt-20 sm:size-40`}
      />

      {/* People on the orbit */}
      {[
        {
          name: "س",
          cls: "start-[7%] top-[18%]",
          bg: "bg-(--lime) text-(--ink)",
          speaking: true,
        },
        { name: "ا", cls: "start-[40%] top-[14%]", bg: "bg-(--raised-2)" },
        { name: "ن", cls: "start-[45%] bottom-[30%]", bg: "bg-(--raised)" },
        { name: "ک", cls: "start-[5%] bottom-[16%]", bg: "bg-(--raised-2)" },
      ].map((p) => (
        <span
          key={p.name}
          className={`${p.cls} ${p.bg} ${p.speaking ? "landing-speaking" : ""} absolute grid size-10 place-items-center rounded-full font-bold text-(--fg) ring-4 ring-white/10 sm:size-12`}
        >
          {p.name}
        </span>
      ))}

      {/* "Someone is talking" bubble */}
      <div className="absolute end-[6%] top-[12%] hidden items-center gap-3 rounded-2xl bg-(--raised)/80 px-4 py-3 text-(--fg) ring-1 ring-(--hair) backdrop-blur-md sm:flex">
        <span className="grid size-9 place-items-center rounded-full bg-(--lime) text-(--ink)">
          <Mic className="size-4" />
        </span>
        <span className="text-sm font-medium">سارا حرف می‌زند</span>
        <span className={`landing-wave flex h-6 items-end gap-0.5`}>
          {[0, 0.2, 0.4, 0.1, 0.3].map((d) => (
            <span
              key={d}
              className="h-full w-1 rounded-full bg-(--lime)"
              style={{ "--d": `${d}s` } as CSSProperties}
            />
          ))}
        </span>
      </div>

      <Heart3D
        className={`landing-float absolute end-[10%] top-1/2 w-32 -translate-y-1/2 sm:end-[16%] sm:w-52`}
      />

      {/* Call bar */}
      <div className="absolute inset-x-0 bottom-5 flex justify-center sm:bottom-8">
        <div className="flex items-center gap-2 rounded-full bg-(--raised)/80 p-2 ring-1 ring-(--hair) backdrop-blur-md">
          {[Mic, Video, MonitorUp].map((Icon, i) => (
            <span
              key={i}
              className="grid size-10 place-items-center rounded-full bg-(--raised-2) text-(--fg)"
            >
              <Icon className="size-4" />
            </span>
          ))}
          <span className="grid size-10 place-items-center rounded-full bg-(--danger) text-white">
            <PhoneOff className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

const HEART =
  "M50 88C20 66 0 48 0 26 0 11 12 0 26 0c10 0 19 6 24 14C55 6 64 0 74 0c14 0 26 11 26 26 0 22-20 40-50 62Z";

/** A fake-3D heart: a lime face over an olive extrusion with a dark hollow. */
function Heart3D({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="-4 -4 118 108" className={className} aria-hidden>
      <defs>
        <linearGradient id="heart-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6fcd6" />
          <stop offset="0.55" stopColor="#e6f7a3" />
          <stop offset="1" stopColor="#c4d96c" />
        </linearGradient>
      </defs>
      <path d={HEART} transform="translate(9 9)" fill="#6f7a2e" />
      <path d={HEART} transform="translate(4.5 4.5)" fill="#a0b23f" />
      <path d={HEART} fill="url(#heart-face)" />
      <path d={HEART} transform="translate(30 25) scale(0.4)" fill="#161616" />
    </svg>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-24 px-4 pt-28 sm:px-6 sm:pt-36">
      <SectionTitle className="landing-reveal">
        صدای واضح، حتی با اینترنت ضعیف
      </SectionTitle>

      <div
        className={`landing-reveal mx-auto mt-12 grid max-w-6xl gap-4 lg:grid-cols-[1fr_1.35fr]`}
      >
        <article className="flex flex-col rounded-[2rem] bg-(--soft) p-5 sm:p-7">
          <h3 className="text-xl font-medium sm:text-2xl">
            چه کسی حرف می‌زند؟
          </h3>
          <p className="mt-1 text-sm text-(--muted)">
            در هر کانال صوتی می‌بینید چه کسانی هستند و صدای کدامشان بلندتر است.
          </p>
          <ul className="mt-5 flex flex-1 flex-col justify-center gap-2.5 rounded-2xl bg-(--raised) p-4">
            {SPEAKERS.map((p) => (
              <li key={p.name} className="flex items-center gap-3">
                <div className="h-7 flex-1">
                  <div
                    className={`landing-level flex h-full items-center justify-start rounded-md bg-linear-to-l from-(--lime-strong) to-(--lime) px-2`}
                    style={
                      {
                        "--lo": p.lo,
                        "--hi": p.hi,
                        "--t": p.t,
                      } as CSSProperties
                    }
                  >
                    <Mic className="size-3.5 text-(--ink)" aria-hidden />
                  </div>
                </div>
                <span className="w-12 text-sm">{p.name}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex gap-2" aria-hidden>
            <span className="h-1 flex-[3] rounded-full bg-(--lime)" />
            <span className="h-1 flex-[2] rounded-full bg-(--raised-2)" />
            <span className="h-1 flex-[2] rounded-full bg-(--raised)" />
          </div>
        </article>

        <article className="rounded-[2rem] bg-(--soft) p-5 sm:p-7">
          <h3 className="text-xl font-medium sm:text-2xl">حالت کم‌مصرف</h3>
          <p className="mt-1 mb-5 text-sm text-(--muted)">
            یکی از دو حالت را امتحان کنید.
          </p>
          <LowDataDemo />
        </article>
      </div>
    </section>
  );
}

function Steps() {
  const track = [...MARQUEE, ...MARQUEE];
  return (
    <section id="how" className="scroll-mt-24 px-4 pt-28 sm:px-6 sm:pt-36">
      <div
        className={`landing-reveal flex flex-wrap items-center justify-center gap-x-5 gap-y-3`}
      >
        <h2 className="text-4xl font-medium sm:text-7xl">همه‌چیز در یک‌جا</h2>
        <div
          className="w-56 -rotate-3 overflow-hidden rounded-2xl bg-(--lime) py-2.5 sm:w-72 sm:py-4"
          aria-hidden
        >
          <div
            className={`landing-marquee flex w-max text-black gap-6 text-lg font-bold whitespace-nowrap sm:text-2xl`}
          >
            {track.map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="sr-only">امکانات: {MARQUEE.join("، ")}</p>

      <ol className="mx-auto mt-16 grid max-w-5xl gap-4 sm:mt-24 sm:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className={`landing-reveal rounded-[1.75rem] bg-(--soft) p-3 ${i === 1 ? "sm:-translate-y-10" : ""}`}
            >
              <div className="px-3 pt-3 pb-4">
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-(--muted)">
                  {step.text}
                </p>
              </div>
              <div
                className={`${step.color} relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-2xl p-4`}
              >
                <span className="self-start rounded-full bg-black/20 px-3 py-1 text-xs font-medium">
                  {step.tag}
                </span>
                <Icon
                  className="absolute -end-4 -top-4 size-32 rotate-12 opacity-10"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <div className="flex items-end justify-between">
                  <span className="text-6xl leading-none font-light sm:text-7xl">
                    ۰{["۱", "۲", "۳"][i]}
                  </span>
                  <ArrowUpLeft className="size-6" aria-hidden />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Chip({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`${className} mx-1 inline-grid size-[1.15em] -rotate-6 place-items-center rounded-[0.35em] align-[-0.12em]`}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** The big paragraph whose words darken one by one as it scrolls through the screen. */
function Statement() {
  const parts: (string | ReactNode)[] = [
    "صدامون از ورود با شماره‌ی موبایل تا تماس تصویری، همه‌چیز را روی شبکه‌ی داخلی",
    <Chip key="server" className="bg-(--lime) text-(--ink)">
      <Server className="size-[0.6em]" />
    </Chip>,
    "اجرا می‌کند تا وقتی اینترنت بین‌الملل قطع است هم دور هم بمانید و صدای هم را",
    <Chip key="audio" className="bg-(--raised-2) text-(--fg)">
      <AudioLines className="size-[0.6em]" />
    </Chip>,
    "بشنوید.",
  ];

  let i = 0;
  return (
    <section className="px-4 pt-28 sm:px-6 sm:pt-40">
      <p
        className={`landing-statement mx-auto max-w-4xl text-center text-2xl leading-[1.7] font-medium text-balance sm:text-4xl lg:text-5xl lg:leading-[1.6]`}
      >
        {parts.map((part) =>
          typeof part === "string"
            ? part.split(" ").map((word) => (
                <span
                  key={i}
                  className="landing-word"
                  style={{ "--i": i++ } as CSSProperties}
                >
                  {word}{" "}
                </span>
              ))
            : part,
        )}
      </p>
    </section>
  );
}

function Facts() {
  return (
    <section
      id="why"
      className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-28 sm:px-6 sm:pt-36"
    >
      <SectionTitle className={`landing-reveal mb-10 sm:mb-14`}>
        چرا صدامون؟
      </SectionTitle>
      {FACTS.map((fact) => {
        const Icon = fact.icon;
        return (
          <div
            key={fact.big}
            className={`landing-reveal grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 border-b border-(--hair) py-8 md:grid-cols-[auto_1fr_20rem] md:gap-x-10`}
          >
            <div
              className={`grid size-20 place-items-center rounded-2xl bg-linear-to-br sm:size-32 sm:rounded-3xl ${fact.tile}`}
              aria-hidden
            >
              <Icon
                className={`size-9 sm:size-14 ${fact.accent}`}
                strokeWidth={1.5}
              />
            </div>
            <div className="relative">
              <span className="absolute -top-6 start-1 -rotate-6 rounded-full bg-(--lime-strong) px-3 py-1 text-xs font-bold whitespace-nowrap text-(--ink) sm:-top-8 sm:text-sm">
                {fact.tag}
              </span>
              <p className="text-4xl leading-tight font-light sm:text-7xl lg:text-8xl">
                {fact.big}
              </p>
            </div>
            <p className="col-span-2 text-sm leading-7 text-pretty text-(--muted) md:col-span-1">
              {fact.text}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function Uses() {
  return (
    <section className="px-4 pt-28 sm:px-6 sm:pt-36">
      <SectionTitle className="landing-reveal">
        برای هر جمعی که با هم حرف می‌زند
      </SectionTitle>
      <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3 md:items-start">
        {USES.map((use, i) => (
          <figure
            key={use.who}
            className={`landing-reveal flex flex-col gap-5 rounded-[1.75rem] bg-(--soft) p-6 ${i === 1 ? "md:mt-12" : ""}`}
          >
            <Quote
              className="size-8 -scale-x-100 fill-(--lime) text-(--lime)"
              aria-hidden
            />
            <blockquote className="leading-8">{use.text}</blockquote>
            <figcaption className="border-t border-(--hair) pt-4">
              <span className="block font-medium">{use.who}</span>
              <span className="text-sm text-(--muted)">{use.what}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 px-4 pt-28 sm:px-6 sm:pt-36">
      <SectionTitle className="landing-reveal">پرسش‌های پرتکرار</SectionTitle>
      <div className="mx-auto mt-10 max-w-3xl">
        {FAQ.map((item) => (
          <details
            key={item.q}
            className={`landing-faq group border-b border-(--hair)`}
          >
            <summary className="flex list-none items-center justify-between gap-4 rounded-lg py-5 font-medium">
              {item.q}
              <Plus
                className={`landing-faq-icon size-5 shrink-0 transition-transform duration-200`}
                aria-hidden
              />
            </summary>
            <p className="pb-6 text-sm leading-7 text-(--muted)">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="px-4 pt-28 sm:px-6 sm:pt-36">
      <div
        className={`landing-reveal relative mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] bg-(--soft) ring-1 ring-(--hair) sm:rounded-[2.75rem] md:grid-cols-2`}
      >
        <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-6 py-14 text-center md:items-start md:px-14 md:text-start">
          <h2 className="text-3xl leading-[1.4] font-medium text-balance sm:text-5xl">
            سرورتان را بسازید، دوستانتان را صدا کنید
          </h2>
          <p className="max-w-md leading-8 text-(--muted)">
            ساخت حساب یک دقیقه طول می‌کشد. فقط شماره‌ی موبایل لازم است.
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-(--lime-strong) px-6 font-bold text-(--ink) shadow-glow transition hover:brightness-105 active:scale-[0.98]"
          >
            همین حالا شروع کنید
          </Link>
        </div>
        <div className="relative h-64 md:h-auto" aria-hidden>
          <div className="absolute inset-0 m-auto size-72 rounded-full border border-white/10" />
          <div
            className={`landing-sphere landing-float-slow absolute start-[20%] top-[18%] size-24 rounded-full sm:size-32`}
          />
          <Heart3D
            className={`landing-float absolute end-[14%] bottom-[12%] w-36 sm:w-44`}
          />
          <span
            className={`landing-speaking absolute end-[30%] top-[16%] grid size-12 place-items-center rounded-full bg-(--lime) font-bold text-(--ink)`}
          >
            ن
          </span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto mt-24 flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-(--hair) px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-(--muted) sm:flex-row sm:px-6">
      <Logo />
      <p>صدامون، ساخته‌شده برای شبکه‌ی داخلی</p>
      <Link href="/login" className="rounded-lg hover:text-(--lime)">
        ورود به حساب
      </Link>
    </footer>
  );
}

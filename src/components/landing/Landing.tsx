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
  Plus,
  Quote,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import { FAQ, FEATURES, SITE, SITE_URL, STEPS, jsonLd } from "@/lib/site";
import { BrandMark } from "@/components/BrandMark";
import AppMockup from "./AppMockup";
import Benefits from "./Benefits";
import "./landing.css";

// Anchors carry the path so the same header works on the about and policy pages.
const NAV = [
  { href: "/#features", label: "امکانات" },
  { href: "/#how", label: "شروع کار" },
  { href: "/#why", label: "چرا صدامون" },
  { href: "/#faq", label: "پرسش‌ها" },
];

const FOOTER_LINKS = [
  { href: "/about", label: "درباره‌ی صدامون" },
  { href: "/privacy", label: "حریم خصوصی" },
  { href: "/terms", label: "قوانین استفاده" },
  { href: "/login", label: "ورود به حساب" },
];

// Text lives in lib/site.ts (it also feeds the HowTo schema and llms.txt); these are the matching tiles.
const STEP_TILES = [
  { color: "bg-(--raised-2) text-(--fg)", icon: Hash },
  { color: "bg-(--raised) text-(--fg)", icon: Users },
  { color: "bg-(--lime) text-(--ink)", icon: Headphones },
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

export default function Landing() {
  return (
    <div className={`landing-root min-h-full`}>
      <StructuredData />
      <Header />
      <main>
        <Hero />
        <Benefits />
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

/** What search engines and AI assistants read about the site: who runs it, what the app is, the FAQ and the steps. */
function StructuredData() {
  const org = `${SITE_URL}/#organization`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": org,
        name: SITE.name,
        alternateName: SITE.nameEn,
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512.png`,
        description: SITE.description,
        areaServed: { "@type": "Country", name: "Iran" },
        ...(SITE.contactEmail && {
          contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SITE.contactEmail },
        }),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE.name,
        alternateName: SITE.nameEn,
        url: SITE_URL,
        inLanguage: "fa-IR",
        publisher: { "@id": org },
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE.name,
        alternateName: SITE.nameEn,
        url: SITE_URL,
        description: SITE.description,
        applicationCategory: "CommunicationApplication",
        operatingSystem: "Web browser (Android, iOS, Windows, macOS, Linux)",
        browserRequirements: "Requires a modern browser with WebRTC",
        inLanguage: "fa-IR",
        featureList: FEATURES,
        image: `${SITE_URL}/opengraph-image.png`,
        publisher: { "@id": org },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        inLanguage: "fa-IR",
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
      {
        "@type": "HowTo",
        "@id": `${SITE_URL}/#how`,
        name: "شروع کار با صدامون در سه قدم",
        inLanguage: "fa-IR",
        totalTime: "PT1M",
        step: STEPS.map((step, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: step.title,
          text: step.text,
          url: `${SITE_URL}/#how`,
        })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}

/* ---- Pieces ----------------------------------------------------------------------------------- */

function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-lg"
      aria-label="صدامون"
    >
      <BrandMark className="size-8" />
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
      href="/signup"
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

export function Header() {
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
            href="/signup"
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
    <section className="relative isolate px-4 pt-12 sm:px-6 sm:pt-20">
      <div className="relative mx-auto max-w-5xl">
        <p className="text-xs font-bold text-(--muted)">
          صدا، تصویر و گفت‌وگو روی شبکه‌ی داخلی
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl leading-[1.3] font-medium text-balance sm:text-6xl">
          دور هم باشید، هر جا که هستید
        </h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-pretty text-(--muted) sm:text-lg">
          صدامون سرورهای صوتی، تصویری و متنی برای دوستان، کلاس‌ها و جمع‌های
          بازی است. همه‌چیز روی شبکه‌ی داخلی اجرا می‌شود، پس بدون فیلترشکن و
          با قطع اینترنت بین‌الملل هم صدای هم را می‌شنوید.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <PrimaryButton>همین حالا شروع کنید</PrimaryButton>
          <span className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-full bg-(--raised) ring-1 ring-(--hair)">
              <ShieldCheck className="size-5 text-(--lime)" aria-hidden />
            </span>
            <span className="leading-5">
              <span className="block text-sm font-bold">بدون فیلترشکن</span>
              <span className="block text-xs text-(--muted)">
                با قطع اینترنت بین‌الملل هم وصل است
              </span>
            </span>
          </span>
        </div>
      </div>

      <div className="relative mt-24 sm:mt-28">
        <div className="landing-glow" aria-hidden />
        {/* The mockup's chat lines and member counts are made up; keep them out of search snippets. */}
        <div data-nosnippet>
          <AppMockup />
        </div>
        <Heart3D className="landing-float absolute -bottom-12 end-[2%] w-20 sm:-bottom-8 sm:end-[6%] sm:w-36" />
      </div>

      <FeatureStrip />
    </section>
  );
}

/** A quiet, edge-faded row of feature names drifting under the mockup, where a logo row would sit. */
function FeatureStrip() {
  const track = [...FEATURES, ...FEATURES];
  return (
    <div className="landing-strip relative mx-auto mt-14 max-w-5xl overflow-hidden py-2 sm:mt-16">
      <div
        className="landing-marquee flex w-max gap-12 text-lg font-bold whitespace-nowrap text-(--muted)/60 sm:text-xl"
        aria-hidden
      >
        {track.map((item, i) => (
          <span key={i}>{item}</span>
        ))}
      </div>
      <p className="sr-only">امکانات: {FEATURES.join("، ")}</p>
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

function Steps() {
  return (
    <section id="how" className="scroll-mt-24 px-4 pt-28 sm:px-6 sm:pt-36">
      <p className="landing-reveal text-center text-xs font-bold text-(--muted)">
        شروع کار
      </p>
      <SectionTitle className="landing-reveal mt-4">
        در <span className="text-(--lime)">سه قدم</span> دور هم جمع شوید
      </SectionTitle>

      <ol className="mx-auto mt-16 grid max-w-5xl gap-4 sm:mt-24 sm:grid-cols-3">
        {STEPS.map((step, i) => {
          const { color, icon: Icon } = STEP_TILES[i];
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
                className={`${color} relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-2xl p-4`}
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
      <figure className="mx-auto max-w-4xl text-center">
        <BrandMark className="mx-auto mb-8 size-12" />
        <blockquote
          className={`landing-statement text-2xl leading-[1.7] font-medium text-balance sm:text-4xl lg:text-5xl lg:leading-[1.6]`}
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
        </blockquote>
        <figcaption className="mt-8 text-sm text-(--muted)">
          <span className="block font-bold text-(--fg)">تیم صدامون</span>
          ساخته‌شده برای شبکه‌ی داخلی
        </figcaption>
      </figure>
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
            href="/signup"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-(--lime-strong) px-6 font-bold text-(--ink) shadow-glow transition hover:brightness-105 active:scale-[0.98]"
          >
            همین حالا شروع کنید
          </Link>
        </div>
        <div className="relative h-64 md:h-auto" aria-hidden data-nosnippet>
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

export function Footer() {
  return (
    <footer className="mx-auto mt-24 flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-(--hair) px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-(--muted) md:flex-row sm:px-6">
      <Logo />
      <p>صدامون، ساخته‌شده برای شبکه‌ی داخلی</p>
      <nav aria-label="پیوندهای صدامون" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-lg hover:text-(--lime)">
            {link.label}
          </Link>
        ))}
      </nav>
      <a
        referrerPolicy="origin"
        target="_blank"
        href="https://trustseal.enamad.ir/?id=8559464&Code=irtw8EIeY9ZIooItZNsGuv2pT8hrEmDL"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          referrerPolicy="origin"
          src="https://trustseal.enamad.ir/logo.aspx?id=8559464&Code=irtw8EIeY9ZIooItZNsGuv2pT8hrEmDL"
          alt=""
          style={{ cursor: "pointer" }}
          // @ts-expect-error enamad requires this non-standard attribute
          code="irtw8EIeY9ZIooItZNsGuv2pT8hrEmDL"
        />
      </a>
    </footer>
  );
}

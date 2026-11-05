"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Compass,
  Cpu,
  Gamepad2,
  GraduationCap,
  Headphones,
  Link2,
  Loader2,
  Megaphone,
  MessagesSquare,
  Mic,
  Music,
  Palette,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { api } from "@/lib/api";
import { categoryLabel } from "@/lib/discovery";
import { cn } from "@/lib/format";
import { resizeToAvatar } from "@/lib/image";
import { INTERESTS, USE_CASES, type UseCaseId } from "@/lib/onboarding";
import { toPersianDigits } from "@/lib/phone";
import type { DiscoverDTO, DiscoverServerDTO, MeDTO, ServerDTO } from "@/lib/types";
import Avatar, { ServerAvatar } from "@/components/app/Avatar";
import PixelScene from "@/components/auth/PixelScene";
import Skeleton from "@/components/ui/skeleton";
import ChoiceCard from "./ChoiceCard";
import MicTest from "./MicTest";

type Step = "useCase" | "interests" | "profile" | "mic" | "server";
type Start = "create" | "join" | "explore";

const STEPS: Step[] = ["useCase", "interests", "profile", "mic", "server"];
const MAX_BIO = 190;

const COPY: Record<Step, { title: string; lead: string; tip: string }> = {
  useCase: {
    title: "برای چه کاری به صدامون آمده‌اید؟",
    lead: "بر اساس جوابتان، شروع کار را برایتان ساده‌تر می‌کنیم.",
    tip: "هر وقت خواستید می‌توانید چند سرور برای کارهای مختلف داشته باشید",
  },
  interests: {
    title: "به چه چیزهایی علاقه دارید؟",
    lead: "هر چند تا که دوست دارید انتخاب کنید تا سرورهای هم‌سلیقه را پیشنهاد بدهیم.",
    tip: "سرورهای عمومی صدامون در همین دسته‌ها فهرست شده‌اند",
  },
  profile: {
    title: "خودتان را معرفی کنید",
    lead: "عکس و چند کلمه درباره‌ی خودتان؛ بقیه شما را با همین می‌شناسند.",
    tip: "عکس پروفایل پیش از ارسال کوچک می‌شود تا با اینترنت ضعیف هم سریع برسد",
  },
  mic: {
    title: "صدایتان را امتحان کنیم",
    lead: "پیش از اولین تماس مطمئن شوید میکروفون درست کار می‌کند.",
    tip: "صدایی ضبط یا ارسال نمی‌شود؛ تست فقط روی دستگاه خودتان است",
  },
  server: {
    title: "از کجا شروع کنیم؟",
    lead: "سرور خودتان را بسازید، با لینک دعوت بپیوندید یا در سرورهای عمومی بگردید.",
    tip: "هر سرور یک کانال متنی و یک اتاق صوتی آماده دارد",
  },
};

const USE_CASE_ICONS: Record<UseCaseId, LucideIcon> = {
  friends: Users,
  gaming: Headphones,
  study: BookOpen,
  community: Megaphone,
};

const INTEREST_ICONS: Record<string, LucideIcon> = {
  chat: MessagesSquare,
  gaming: Gamepad2,
  music: Music,
  movies: Clapperboard,
  tech: Cpu,
  education: GraduationCap,
  art: Palette,
  sports: Trophy,
  business: Briefcase,
};

const STARTS: { id: Start; icon: LucideIcon; title: string; lead: string }[] = [
  { id: "create", icon: Sparkles, title: "ساختن سرور", lead: "جایی برای خودتان و دوستانتان." },
  { id: "join", icon: Link2, title: "لینک دعوت دارم", lead: "یکی شما را به سرورش دعوت کرده." },
  { id: "explore", icon: Compass, title: "گشتن در سرورها", lead: "سرورهای عمومی هم‌سلیقه‌ی شما." },
];

/** A name for the first server that fits what they came for. */
const SERVER_NAME_PREFIX: Record<UseCaseId, string> = {
  friends: "پاتوق",
  gaming: "تیم",
  study: "کلاس",
  community: "جامعه‌ی",
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * The first-run setup after sign-up: five short questions on the left, the pixel art and a live preview of
 * the person's profile on the right. Answers are saved as they go; "later" ends it at any point.
 */
export default function Onboarding({
  me: initialMe,
  initialUseCase,
  initialInterests,
}: {
  me: MeDTO;
  initialUseCase: string;
  initialInterests: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("useCase");
  const [me, setMe] = useState(initialMe);
  const [useCase, setUseCase] = useState<UseCaseId | "">(USE_CASES.some((u) => u.id === initialUseCase) ? (initialUseCase as UseCaseId) : "");
  const [interests, setInterests] = useState<string[]>(initialInterests);
  const [name, setName] = useState(initialMe.name);
  const [bio, setBio] = useState(initialMe.bio);
  const [micReady, setMicReady] = useState(false);
  const [start, setStart] = useState<Start | "">("");
  const [serverName, setServerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string>();

  const index = STEPS.indexOf(step);
  const copy = COPY[step];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const go = (to: Step) => {
    setError(undefined);
    setStep(to);
    setBusy(false);
  };

  const finish = async (serverId?: string) => {
    await api("/api/me/onboarding", { method: "PATCH", body: { done: true } });
    router.replace(serverId ? `/?server=${serverId}` : "/");
  };

  const skipAll = () => run(() => finish());

  const pickStart = (id: Start) => {
    setStart(id);
    if (id === "create" && !serverName) setServerName(`${SERVER_NAME_PREFIX[useCase || "friends"]} ${firstName(me.name)}`.slice(0, 40));
  };

  const canContinue = (() => {
    if (step === "useCase") return !!useCase;
    if (step === "interests") return interests.length > 0;
    if (step === "profile") return name.trim().length >= 2 && !photoBusy;
    if (step === "server") {
      if (start === "create") return serverName.trim().length >= 2;
      if (start === "join") return inviteCode.trim().length > 0;
      if (start === "explore") return picked.length > 0;
      return false;
    }
    return true;
  })();

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canContinue || busy) return;
    return run(async () => {
      if (step === "useCase") {
        await api("/api/me/onboarding", { method: "PATCH", body: { useCase } });
        go("interests");
      } else if (step === "interests") {
        await api("/api/me/onboarding", { method: "PATCH", body: { interests } });
        go("profile");
      } else if (step === "profile") {
        if (name.trim() !== me.name || bio.trim() !== me.bio) {
          setMe((await api<{ user: MeDTO }>("/api/me", { method: "PATCH", body: { name, bio } })).user);
        }
        go("mic");
      } else if (step === "mic") {
        go("server");
      } else {
        let serverId: string | undefined;
        if (start === "create") serverId = (await api<{ server: ServerDTO }>("/api/servers", { body: { name: serverName } })).server.id;
        if (start === "join") serverId = (await api<{ server: ServerDTO }>("/api/servers/join", { body: { code: inviteCode } })).server.id;
        if (start === "explore") {
          for (const id of picked) await api(`/api/discover/${id}/join`, { method: "POST" });
          serverId = picked[0];
        }
        await finish(serverId);
      }
    });
  };

  const changePhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setError(undefined);
    try {
      const body = await resizeToAvatar(file);
      const res = await fetch("/api/me/avatar", { method: "POST", body, headers: { "Content-Type": body.type } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "بارگذاری تصویر ممکن نشد");
      setMe(data.user);
    } catch (err) {
      setError(err instanceof DOMException ? "این فایل تصویر معتبری نیست" : (err as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const optional = step === "profile" || step === "mic";
  const last = step === "server";

  return (
    <main className="flex min-h-full bg-ink-950 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-safe-2 sm:p-4 lg:p-6">
      <div className="animate-pop-in mx-auto grid w-full max-w-6xl gap-2 rounded-[2rem] bg-ink-900 p-2 lg:min-h-[min(48rem,calc(100dvh-3rem))] lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={next} className="flex min-w-0 flex-col px-3 pt-3 pb-4 sm:px-8 lg:px-10 lg:pt-8 lg:pb-8">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 rounded-full">
              <BrandMark className="size-9" radius={256} />
              <span className="text-lg font-extrabold">صدامون</span>
            </Link>
            <button
              type="button"
              onClick={skipAll}
              disabled={busy}
              className="min-h-11 rounded-full px-4 text-sm font-medium text-muted transition-colors hover:bg-ink-800 hover:text-fg"
            >
              بعداً تنظیم می‌کنم
            </button>
          </header>

          <div className="mt-8 lg:mt-12">
            <ol aria-label="مراحل" className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  aria-current={i === index ? "step" : undefined}
                  className={cn(
                    "h-1.5 w-10 rounded-full transition-colors duration-300 sm:w-12",
                    i < index ? "bg-accent-strong/45" : i === index ? "bg-accent-strong" : "bg-ink-700",
                  )}
                >
                  <span className="sr-only">{COPY[s].title}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2.5 text-sm text-muted tabular-nums">
              {toPersianDigits(index + 1)} از {toPersianDigits(STEPS.length)}
            </p>
          </div>

          {/* Keyed so each step slides in fresh. */}
          <div key={step} className="animate-drop-in flex flex-1 flex-col">
            <h1 className="mt-5 max-w-xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-7 text-muted sm:text-base">{copy.lead}</p>

            <div className="mt-8 flex-1">
              {step === "useCase" && (
                <div role="radiogroup" aria-label={copy.title} className="grid grid-cols-2 gap-2 rounded-[2rem] bg-ink-850 p-2 md:grid-cols-4">
                  {USE_CASES.map((u) => (
                    <ChoiceCard
                      key={u.id}
                      icon={USE_CASE_ICONS[u.id]}
                      title={u.title}
                      lead={u.lead}
                      selected={useCase === u.id}
                      onToggle={() => setUseCase(u.id)}
                    />
                  ))}
                </div>
              )}

              {step === "interests" && (
                <>
                  <Carousel label={copy.title}>
                    {INTERESTS.map((c) => (
                      <ChoiceCard
                        key={c.id}
                        icon={INTEREST_ICONS[c.id] ?? Sparkles}
                        title={c.label}
                        centered
                        multiple
                        selected={interests.includes(c.id)}
                        onToggle={() => setInterests((all) => (all.includes(c.id) ? all.filter((x) => x !== c.id) : [...all, c.id]))}
                      />
                    ))}
                  </Carousel>
                  <p aria-live="polite" className="mt-3 text-center text-sm text-muted">
                    {interests.length ? `${toPersianDigits(interests.length)} مورد انتخاب شد` : "دست‌کم یکی را انتخاب کنید"}
                  </p>
                </>
              )}

              {step === "profile" && (
                <div className="grid gap-6 rounded-[2rem] bg-ink-850 p-4 sm:grid-cols-[auto_1fr] sm:p-6">
                  <label className="relative mx-auto block size-fit self-start rounded-full">
                    <Avatar user={{ ...me, name: name.trim() || me.name }} size="lg" />
                    <span className="absolute -end-1 -bottom-1 grid size-9 place-items-center rounded-full bg-accent-strong text-on-accent ring-4 ring-ink-850">
                      {photoBusy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                    </span>
                    <span className="sr-only">انتخاب عکس پروفایل</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={photoBusy}
                      onChange={(e) => {
                        void changePhoto(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div className="space-y-4">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-muted">نام نمایشی</span>
                      <input className="field" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="flex justify-between text-sm font-medium text-muted">
                        درباره‌ی من
                        <span className="tabular-nums">
                          {toPersianDigits(bio.length)}/{toPersianDigits(MAX_BIO)}
                        </span>
                      </span>
                      <textarea
                        className="field min-h-24 resize-none leading-7"
                        maxLength={MAX_BIO}
                        rows={3}
                        placeholder="مثلاً: عاشق فوتبال و بازی‌های استراتژیک، شب‌ها آنلاینم."
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {step === "mic" && <MicTest onHeard={() => setMicReady(true)} />}

              {step === "server" && (
                <div className="space-y-2">
                  <div role="radiogroup" aria-label={copy.title} className="grid grid-cols-3 gap-2 rounded-[2rem] bg-ink-850 p-2">
                    {STARTS.map((s) => (
                      <ChoiceCard key={s.id} icon={s.icon} title={s.title} lead={s.lead} selected={start === s.id} onToggle={() => pickStart(s.id)} />
                    ))}
                  </div>
                  {start && (
                    <div key={start} className="animate-drop-in rounded-[2rem] bg-ink-850 p-4 sm:p-5">
                      {start === "create" && (
                        <label className="block space-y-1.5">
                          <span className="text-sm font-medium text-muted">نام سرور</span>
                          <input className="field" maxLength={40} value={serverName} onChange={(e) => setServerName(e.target.value)} autoFocus />
                        </label>
                      )}
                      {start === "join" && (
                        <label className="block space-y-1.5">
                          <span className="text-sm font-medium text-muted">لینک یا کد دعوت</span>
                          <input
                            className="field text-start"
                            dir="ltr"
                            placeholder="https://…/invite/abc123"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            autoFocus
                          />
                        </label>
                      )}
                      {start === "explore" && (
                        <Suggestions
                          interests={interests}
                          picked={picked}
                          onToggle={(id) => setPicked((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]))}
                          onCreate={() => pickStart("create")}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger ring-1 ring-danger/25">
              {error}
            </p>
          )}

          <footer className="mt-8 flex flex-wrap items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => go(STEPS[index - 1])}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold ring-1 ring-white/15 transition-colors hover:bg-ink-800"
              >
                <ArrowRight className="size-4" />
                قبلی
              </button>
            )}
            <button className="btn-primary min-w-36" disabled={!canContinue || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {last ? "ورود به صدامون" : "ادامه"}
              {!busy && <ArrowLeft className="size-4" />}
            </button>
            {(optional || last) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => (last ? skipAll() : go(STEPS[index + 1]))}
                className="ms-auto min-h-11 rounded-full px-4 text-sm font-medium text-muted transition-colors hover:text-fg"
              >
                {last ? "فعلاً نه" : "رد شدن"}
              </button>
            )}
          </footer>
        </form>

        <aside aria-label="پیش‌نمایش پروفایل" className="relative hidden overflow-hidden rounded-[1.5rem] lg:block">
          <PixelScene src="/auth/scene.mp4" poster="/auth/scene.jpg" className="absolute inset-0" />
          <p key={step} className="animate-fade-in absolute inset-x-4 top-4 flex items-start gap-2 rounded-2xl bg-ink-950/70 px-3.5 py-2.5 text-sm leading-6 backdrop-blur-md">
            <Sparkles className="mt-1 size-4 shrink-0 text-accent" />
            {copy.tip}
          </p>
          <ProfilePreview
            me={{ ...me, name: name.trim() || me.name, bio: step === "profile" ? bio : me.bio }}
            useCase={useCase}
            interests={interests}
            micReady={micReady}
          />
        </aside>
      </div>
    </main>
  );
}

/**
 * A row of cards that pages sideways, with dots and arrows. It is a plain scroll-snap strip, so swiping works
 * on phones; the arrows and dots just scroll it by a page. Scrolling runs right-to-left like the page.
 */
function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const count = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth - 0.05));
      // RTL scrollLeft runs from 0 down to -max; the last page may be partial, so snap to it at the end.
      const at = Math.abs(el.scrollLeft);
      setPages(count);
      setPage(at >= max - 4 ? count - 1 : Math.round(at / el.clientWidth));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

  const goTo = (p: number) => {
    const el = strip.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: -p * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };

  const arrow = "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-fg text-ink-950 shadow-float transition-[opacity,transform] duration-200 hover:scale-105";

  return (
    <div>
      <div className="relative rounded-[2rem] bg-ink-850 p-2">
        <div
          ref={strip}
          role="group"
          aria-label={label}
          className="scrollbar-none grid snap-x snap-mandatory auto-cols-[calc((100%-0.5rem)/2)] grid-flow-col gap-2 overflow-x-auto scroll-smooth rounded-3xl sm:auto-cols-[calc((100%-1rem)/3)] xl:auto-cols-[calc((100%-1.5rem)/4)]"
        >
          {children}
        </div>
        {page > 0 && (
          <button type="button" aria-label="قبلی" onClick={() => goTo(page - 1)} className={cn(arrow, "-start-3")}>
            <ChevronRight className="size-5" />
          </button>
        )}
        {page < pages - 1 && (
          <button type="button" aria-label="بعدی" onClick={() => goTo(page + 1)} className={cn(arrow, "-end-3")}>
            <ChevronLeft className="size-5" />
          </button>
        )}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex justify-center gap-1">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`صفحه‌ی ${toPersianDigits(i + 1)}`}
              aria-current={i === page ? "true" : undefined}
              onClick={() => goTo(i)}
              className="grid size-6 place-items-center rounded-full"
            >
              <span className={cn("h-2 rounded-full transition-all duration-300", i === page ? "w-5 bg-accent-strong" : "w-2 bg-ink-600")} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Public servers ranked by how well they match the chosen interests, biggest first within each. */
function Suggestions({
  interests,
  picked,
  onToggle,
  onCreate,
}: {
  interests: string[];
  picked: string[];
  onToggle: (id: string) => void;
  onCreate: () => void;
}) {
  const [servers, setServers] = useState<DiscoverServerDTO[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api<DiscoverDTO>("/api/discover?sort=members")
      .then((res) => {
        if (!alive) return;
        const fits = (s: DiscoverServerDTO) => (interests.includes(s.category) ? 0 : 1);
        setServers(res.servers.filter((s) => !s.joined).sort((a, b) => fits(a) - fits(b)).slice(0, 4));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [interests]);

  if (failed) return <p className="py-4 text-center text-sm text-danger">فهرست سرورها باز نشد. بعداً از بخش «کاوش» امتحان کنید.</p>;

  if (!servers)
    return (
      <ul aria-busy className="space-y-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="size-11 rounded-2xl" />
            <span className="flex-1 space-y-2">
              <Skeleton className="block h-4 w-1/3" />
              <Skeleton className="block h-3 w-2/3" />
            </span>
          </li>
        ))}
      </ul>
    );

  if (!servers.length)
    return (
      <div className="py-4 text-center text-sm text-muted">
        هنوز سرور عمومی هم‌سلیقه‌ای نیست؛ چرا خودتان اولی را نسازید؟
        <button type="button" onClick={onCreate} className="mt-2 block w-full min-h-11 font-medium text-accent hover:underline">
          ساختن سرور
        </button>
      </div>
    );

  return (
    <ul className="space-y-1">
      {servers.map((s) => {
        const on = picked.includes(s.id);
        return (
          <li key={s.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(s.id)}
              className={cn("flex w-full items-center gap-3 rounded-2xl p-2 text-start transition-colors", on ? "bg-ink-700" : "hover:bg-ink-800")}
            >
              <ServerAvatar name={s.name} icon={s.icon} className="size-11 rounded-2xl text-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="block truncate text-xs text-muted">
                  {categoryLabel(s.category)} · {toPersianDigits(s.memberCount)} عضو
                  {s.description && ` · ${s.description}`}
                </span>
              </span>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-lg transition-colors",
                  on ? "bg-accent-strong text-on-accent" : "ring-1 ring-white/15",
                )}
              >
                {on && <Check className="size-4" strokeWidth={3} />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The person's profile card as others will see it, filling in as they answer. */
function ProfilePreview({ me, useCase, interests, micReady }: { me: MeDTO; useCase: UseCaseId | ""; interests: string[]; micReady: boolean }) {
  const shownInterests = interests.slice(0, 4);
  const more = interests.length - shownInterests.length;
  const chip = "animate-pop-in inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";

  return (
    <div className="surface-float absolute inset-x-4 bottom-4 rounded-3xl p-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Avatar user={me} size="md" online />
        <div className="min-w-0">
          <p className="truncate font-semibold">{me.name}</p>
          <p className={cn("line-clamp-2 text-xs leading-5", me.bio ? "text-fg/80" : "text-muted")}>{me.bio || "درباره‌ی شما اینجا می‌آید"}</p>
        </div>
      </div>
      {(useCase || interests.length > 0 || micReady) && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          {useCase && <span className={cn(chip, "bg-accent-strong text-on-accent")}>{USE_CASES.find((u) => u.id === useCase)?.title}</span>}
          {shownInterests.map((id) => (
            <span key={id} className={cn(chip, "bg-ink-700")}>
              {categoryLabel(id)}
            </span>
          ))}
          {more > 0 && <span className={cn(chip, "bg-ink-700 text-muted")}>+{toPersianDigits(more)}</span>}
          {micReady && (
            <span className={cn(chip, "bg-online/15 text-online")}>
              <Mic className="size-3" />
              میکروفون آماده
            </span>
          )}
        </div>
      )}
    </div>
  );
}

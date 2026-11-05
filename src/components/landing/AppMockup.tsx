import type { CSSProperties, ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import {
  AudioLines,
  Crown,
  Hash,
  Headphones,
  Mic,
  Pin,
  Play,
  Plus,
  Search,
  Shield,
  Smile,
  Users,
  Volume2,
} from "lucide-react";

const RAIL = [
  { label: "ب", cls: "bg-(--lime) text-(--ink)", active: true },
  { label: "ک", cls: "bg-(--raised-2)" },
  { label: "م", cls: "bg-(--raised-2)" },
  { label: "خ", cls: "bg-(--raised-2)" },
];

const TEXT_CHANNELS = [
  { name: "گپ-آزاد", active: true },
  { name: "اعلان‌ها", unread: true },
  { name: "استیکرها" },
];

const LOBBY = [
  { name: "سارا", speaking: true },
  { name: "امید" },
  { name: "نگار" },
];

const MESSAGES: { name: string; time: string; tone: string; body: ReactNode }[] = [
  {
    name: "نگار",
    time: "۲۱:۰۴",
    tone: "bg-(--raised-2)",
    body: "امشب ساعت ده بازی داریم، کی پایه‌ست؟ 🎮",
  },
  {
    name: "امید",
    time: "۲۱:۰۵",
    tone: "bg-(--raised)",
    body: "من هستم، فقط اینترنتم امشب ضعیفه 😅",
  },
  {
    name: "سارا",
    time: "۲۱:۰۶",
    tone: "bg-(--lime) text-(--ink)",
    body: (
      <>
        حالت کم‌مصرف رو روشن کن، صدا قطع نمی‌شه.
        <VoiceNote />
      </>
    ),
  },
];

const MEMBERS = [
  { group: "مالک سرور", people: [{ name: "نگار", icon: Crown, tone: "text-amber-400" }] },
  { group: "مدیر", people: [{ name: "سارا", icon: Shield, tone: "text-sky-400" }] },
  {
    group: "اعضا",
    people: [
      { name: "امید" },
      { name: "کاوه" },
      { name: "مهسا" },
      { name: "آرش" },
    ],
  },
];

/** A drawn copy of the app (server rail, channels, chat, members) for the hero, with cards floating over its edges. */
export default function AppMockup() {
  return (
    <div className="relative mx-auto max-w-5xl" aria-hidden>
      <div className="landing-mockup relative flex h-[26rem] gap-2 overflow-hidden rounded-[1.75rem] bg-(--canvas) p-2 ring-1 ring-white/10 sm:h-[32rem]">
        <Rail />
        <Channels />
        <Chat />
        <Members />
      </div>

      {/* "Unified inbox"-style counter riding the top edge */}
      <div className="landing-float-card absolute -top-10 end-[8%] w-40 rounded-2xl bg-(--fg) p-4 text-(--ink) shadow-2xl sm:-top-12 sm:end-[22%] sm:w-48">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <AudioLines className="size-3.5" />
          در کانال‌های صوتی
        </span>
        <span className="mt-1 block text-4xl leading-none font-light sm:text-5xl">
          ۱۲۸
        </span>
        <span className="mt-1 block text-xs text-black/55">نفر همین حالا</span>
      </div>

      {/* A ping that slides in from the start edge */}
      <div className="landing-float-card absolute bottom-24 -start-2 hidden w-64 items-center gap-3 rounded-2xl bg-(--fg) p-3 text-(--ink) shadow-2xl sm:-start-4 sm:flex xl:-start-16">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--lime) font-bold">
          س
        </span>
        <span className="min-w-0 flex-1 leading-5">
          <span className="block text-sm font-bold">سارا شما را صدا زد</span>
          <span className="block truncate text-xs text-black/55">
            در کانال صوتی لابی
          </span>
        </span>
        <span className="flex flex-col items-end gap-1 self-start text-[11px] text-black/45">
          الان
          <span className="size-2 rounded-full bg-(--online)" />
        </span>
      </div>
    </div>
  );
}

function Rail() {
  return (
    <nav className="hidden w-14 shrink-0 flex-col items-center gap-2 py-2 md:flex">
      <BrandMark className="size-10" radius={140} />
      <span className="my-1 h-px w-6 bg-white/10" />
      {RAIL.map((s) => (
        <span key={s.label} className="relative">
          {s.active && (
            <span className="absolute top-1/2 -start-2 h-6 w-1 -translate-y-1/2 rounded-full bg-(--fg)" />
          )}
          <span
            className={`grid size-10 place-items-center text-sm font-bold ${s.cls} ${s.active ? "rounded-xl" : "rounded-full"}`}
          >
            {s.label}
          </span>
        </span>
      ))}
      <span className="grid size-10 place-items-center rounded-full border border-dashed border-white/20 text-(--muted)">
        <Plus className="size-4" />
      </span>
    </nav>
  );
}

function Channels() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col rounded-[1.25rem] bg-(--soft) md:flex">
      <div className="flex h-12 items-center justify-between border-b border-white/5 px-4">
        <span className="text-sm font-bold">شب‌های بازی</span>
        <Users className="size-4 text-(--muted)" />
      </div>
      <div className="flex-1 space-y-4 px-2 py-3 text-sm">
        <div>
          <p className="px-2 pb-1 text-[11px] text-(--muted)">کانال‌های متنی</p>
          {TEXT_CHANNELS.map((c) => (
            <span
              key={c.name}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${c.active ? "bg-(--raised) text-(--fg)" : "text-(--muted)"} ${c.unread ? "font-bold text-(--fg)" : ""}`}
            >
              <Hash className="size-4 shrink-0" />
              {c.name}
              {c.unread && (
                <span className="ms-auto size-2 rounded-full bg-(--lime)" />
              )}
            </span>
          ))}
        </div>
        <div>
          <p className="px-2 pb-1 text-[11px] text-(--muted)">کانال‌های صوتی</p>
          <span className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-(--fg)">
            <Volume2 className="size-4 shrink-0" />
            لابی
          </span>
          <ul className="ms-6 space-y-1 pb-1">
            {LOBBY.map((p) => (
              <li key={p.name} className="flex items-center gap-2 text-xs">
                <span
                  className={`grid size-6 place-items-center rounded-full bg-(--raised-2) text-[11px] font-bold ${p.speaking ? "ring-2 ring-(--lime)" : ""}`}
                >
                  {p.name[0]}
                </span>
                {p.name}
                {p.speaking && (
                  <span className="landing-wave ms-auto flex h-3 items-end gap-0.5">
                    {[0, 0.25, 0.1].map((d) => (
                      <span
                        key={d}
                        className="h-full w-0.5 rounded-full bg-(--lime)"
                        style={{ "--d": `${d}s` } as CSSProperties}
                      />
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <span className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-(--muted)">
            <Volume2 className="size-4 shrink-0" />
            تماشای فیلم
          </span>
        </div>
      </div>
      <div className="m-2 flex items-center gap-2 rounded-xl bg-(--raised) p-2">
        <span className="relative grid size-8 place-items-center rounded-full bg-(--raised-2) text-xs font-bold">
          آ
          <span className="absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full bg-(--online) ring-2 ring-(--raised)" />
        </span>
        <span className="flex-1 text-xs leading-4">
          آرش
          <span className="block text-[11px] text-(--muted)">آنلاین</span>
        </span>
        <Mic className="size-4 text-(--muted)" />
        <Headphones className="size-4 text-(--muted)" />
      </div>
    </aside>
  );
}

function Chat() {
  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-[1.25rem] bg-(--soft)">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 px-4">
        <span className="grid size-9 place-items-center rounded-full bg-(--raised)">
          <Hash className="size-4" />
        </span>
        <span className="min-w-0 flex-1 leading-5">
          <span className="block text-sm font-bold">گپ-آزاد</span>
          <span className="block text-[11px] text-(--muted)">
            ۲۴ عضو · ۶ آنلاین
          </span>
        </span>
        <Pin className="size-4 text-(--muted)" />
        <Search className="size-4 text-(--muted)" />
      </header>

      <div className="flex flex-1 flex-col justify-end gap-4 overflow-hidden p-4">
        <p className="flex items-center gap-2 rounded-xl bg-(--raised)/60 px-3 py-2 text-xs text-(--muted)">
          <Pin className="size-3.5 shrink-0 text-(--lime)" />
          <span className="truncate">
            سنجاق‌شده: قانون‌های سرور و ساعت بازی‌های هفته
          </span>
        </p>
        {MESSAGES.map((m) => (
          <div key={m.name} className="flex items-start gap-3">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${m.tone}`}
            >
              {m.name[0]}
            </span>
            <div className="min-w-0 text-sm leading-6">
              <span className="font-bold">{m.name}</span>
              <span className="ms-2 text-[11px] text-(--muted)">{m.time}</span>
              <div className="text-(--fg)/90">{m.body}</div>
            </div>
          </div>
        ))}
        <p className="flex items-center justify-center gap-2 text-[11px] text-(--muted)">
          <Volume2 className="size-3" />
          کاوه وارد کانال صوتی لابی شد · همین حالا
        </p>
      </div>

      <div className="m-3 mt-0 flex items-center gap-2 rounded-2xl bg-(--raised) p-2 ps-3 text-sm text-(--muted)">
        <Plus className="size-4" />
        <span className="flex-1 truncate">پیام به #گپ-آزاد</span>
        <Smile className="size-4" />
        <span className="grid size-8 place-items-center rounded-full bg-(--lime) text-(--ink)">
          <Mic className="size-4" />
        </span>
      </div>
    </section>
  );
}

function VoiceNote() {
  const bars = [4, 9, 6, 12, 8, 14, 10, 6, 11, 7, 13, 5, 9, 6, 4];
  return (
    <span className="mt-2 flex w-56 max-w-full items-center gap-2 rounded-full bg-(--raised) p-1.5 pe-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-(--lime) text-(--ink)">
        <Play className="size-3.5 fill-current" />
      </span>
      <span className="flex h-4 flex-1 items-center gap-0.5">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`w-0.5 rounded-full ${i < 6 ? "bg-(--lime)" : "bg-white/25"}`}
            style={{ height: `${h + 2}px` }}
          />
        ))}
      </span>
      <span className="text-[11px] text-(--muted)">۰:۱۲</span>
    </span>
  );
}

function Members() {
  return (
    <aside className="hidden w-52 shrink-0 flex-col gap-4 rounded-[1.25rem] bg-(--soft) p-4 lg:flex">
      <p className="text-xs font-bold">اعضا</p>
      {MEMBERS.map((g) => (
        <div key={g.group}>
          <p className="pb-2 text-[11px] text-(--muted)">{g.group}</p>
          <ul className="space-y-2">
            {g.people.map((p) => {
              const Icon = "icon" in p ? p.icon : null;
              return (
                <li key={p.name} className="flex items-center gap-2 text-xs">
                  <span className="relative grid size-7 place-items-center rounded-full bg-(--raised-2) text-[11px] font-bold">
                    {p.name[0]}
                    <span className="absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full bg-(--online) ring-2 ring-(--soft)" />
                  </span>
                  {p.name}
                  {Icon && "tone" in p && (
                    <Icon className={`size-3.5 ${p.tone}`} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

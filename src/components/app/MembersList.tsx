"use client";

import { Bell, Crown, Info, Plus, Users, Volume2, X } from "lucide-react";
import { cn } from "@/lib/format";
import { shareInvite } from "@/lib/invite";
import { useSwipe } from "@/lib/mobile";
import { useNotificationPref } from "@/lib/notifications";
import { toPersianDigits } from "@/lib/phone";
import type { ChannelDTO, MemberDTO, ServerDTO, VoiceStates } from "@/lib/types";
import Avatar, { ServerAvatar } from "./Avatar";

/**
 * Server info and members: a side column on wide screens (which the user can hide);
 * below xl it slides in from the end edge as a sheet.
 */
export default function MembersList({
  server,
  members,
  channels,
  voiceStates,
  open,
  hidden,
  onClose,
  onNotify,
}: {
  server: ServerDTO;
  members: MemberDTO[];
  channels: ChannelDTO[];
  voiceStates: VoiceStates;
  open: boolean;
  hidden: boolean;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const swipe = useSwipe((toward) => toward === "end" && onClose());
  const notifications = useNotificationPref();
  const liveVoice = channels.filter((c) => c.type === "voice" && voiceStates[c.id]?.length);
  const inVoice = new Set(liveVoice.flatMap((c) => voiceStates[c.id].map((p) => p.id)));
  // Owners first, then people in voice, then everyone else.
  const sorted = [...members].sort(
    (a, b) =>
      Number(b.role === "owner") - Number(a.role === "owner") ||
      Number(inVoice.has(b.user.id)) - Number(inVoice.has(a.user.id)),
  );

  const toggleNotifications = async () => {
    const on = await notifications.toggle();
    if (!on && typeof Notification !== "undefined" && Notification.permission === "denied")
      onNotify("اجازهٔ اعلان در تنظیمات مرورگر بسته است");
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/60 backdrop-blur-sm transition-opacity xl:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        {...swipe}
      />
      <aside
        {...swipe}
        className={cn(
          "scrollbar-thin flex w-[19rem] shrink-0 flex-col overflow-y-auto border-s border-white/5 bg-ink-900 px-5 pb-4 select-none",
          "max-xl:fixed max-xl:inset-y-0 max-xl:end-0 max-xl:z-30 max-xl:w-[min(19rem,calc(100vw-3rem))] max-xl:pt-[env(safe-area-inset-top)] max-xl:pb-safe-4 max-xl:shadow-2xl max-xl:transition-[translate,visibility] max-xl:duration-200 max-xl:ease-out",
          !open && "max-xl:invisible ltr:max-xl:translate-x-full rtl:max-xl:-translate-x-full",
          hidden && "xl:hidden",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-accent-strong text-white shadow-lg shadow-accent-strong/30">
            <Info className="size-4" />
          </span>
          <h3 className="flex-1 text-sm font-semibold">اطلاعات سرور</h3>
          <button
            onClick={onClose}
            aria-label="بستن"
            title="بستن"
            className="rounded-lg p-2 text-muted hover:bg-ink-800 hover:text-fg active:bg-ink-800"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col items-center pt-3 pb-5 text-center">
          <ServerAvatar name={server.name} className="size-24 rounded-full text-4xl ring-4 ring-ink-850" />
          <h2 className="mt-4 max-w-full truncate text-lg font-bold">{server.name}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {toPersianDigits(members.length)} عضو
            {server.role === "owner" && " · شما مالک این سرور هستید"}
          </p>
        </div>

        <button
          onClick={() => shareInvite(server, onNotify)}
          className="flex items-center justify-between rounded-xl py-3 text-sm font-semibold text-accent transition hover:text-fg"
        >
          دعوت دیگران
          <Plus className="size-4" />
        </button>

        <Divider />

        {notifications.available && (
          <>
            <div className="flex items-center gap-3 py-3">
              <Bell className="size-4 text-accent" />
              <span className="flex-1 text-sm font-semibold">اعلان پیام‌ها</span>
              <Switch checked={notifications.enabled} onChange={toggleNotifications} label="اعلان پیام‌ها" />
            </div>
            <Divider />
          </>
        )}

        {liveVoice.length > 0 && (
          <>
            <h3 className="flex items-center gap-2 py-3 text-sm font-semibold">
              <Volume2 className="size-4 text-online" />
              در حال گفت‌وگو
            </h3>
            <div className="space-y-2 pb-3">
              {liveVoice.map((c) => (
                <div key={c.id} className="rounded-2xl bg-ink-850 p-3 ring-1 ring-white/5">
                  <p className="mb-2 truncate text-xs text-muted">{c.name}</p>
                  <div className="flex -space-x-2 rtl:space-x-reverse">
                    {voiceStates[c.id].slice(0, 6).map((p) => (
                      <span key={p.id} title={p.name} className="rounded-full ring-2 ring-ink-850">
                        <Avatar user={p} size="sm" />
                      </span>
                    ))}
                    {voiceStates[c.id].length > 6 && (
                      <span className="grid size-6 place-items-center rounded-full bg-ink-700 text-[10px] ring-2 ring-ink-850">
                        +{toPersianDigits(voiceStates[c.id].length - 6)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Divider />
          </>
        )}

        <h3 className="flex items-center gap-2 py-3 text-sm font-semibold">
          <Users className="size-4 text-accent" />
          اعضا
          <span className="text-xs font-normal text-muted">({toPersianDigits(members.length)})</span>
        </h3>
        <ul className="space-y-1">
          {sorted.map((m) => (
            <li key={m.user.id} className="flex items-center gap-3 rounded-xl py-1.5">
              <span className="relative">
                <Avatar user={m.user} />
                {inVoice.has(m.user.id) && (
                  <span className="absolute -end-0.5 -bottom-0.5 size-3 rounded-full bg-online ring-2 ring-ink-900" />
                )}
              </span>
              <div className="min-w-0 flex-1 leading-5">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="truncate">{m.user.name}</span>
                  {m.role === "owner" && <Crown className="size-3.5 shrink-0 text-amber-400" aria-label="مالک سرور" />}
                </p>
                <p className="text-xs text-muted">
                  {inVoice.has(m.user.id) ? "در کانال صوتی" : m.role === "owner" ? "مالک سرور" : "عضو"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}

function Divider() {
  return <div className="h-px shrink-0 bg-white/5" />;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-accent-strong" : "bg-ink-700",
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-4 rounded-full bg-white shadow transition-all",
          checked ? "start-6" : "start-1",
        )}
      />
    </button>
  );
}

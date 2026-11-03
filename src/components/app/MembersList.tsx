"use client";

import { useState } from "react";
import { Bell, BellOff, Info, LogOut, Plus, Settings, Users, Volume2, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { shareInvite } from "@/lib/invite";
import { useSwipe } from "@/lib/mobile";
import { useNotificationPref } from "@/lib/notifications";
import { can, isMuted, ROLE_LABEL, ROLE_RANK } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import { statusLine } from "@/lib/status";
import type { ChannelDTO, MeDTO, MemberDTO, ServerDTO, VoiceStates } from "@/lib/types";
import Avatar, { ServerAvatar } from "./Avatar";
import { BadgeIcon } from "./Badges";
import { RoleIcon } from "./RoleBadge";

/**
 * Server info and members: a side column on wide screens (which the user can hide);
 * below xl it slides in from the end edge as a sheet.
 */
export default function MembersList({
  me,
  server,
  members,
  channels,
  voiceStates,
  online,
  open,
  hidden,
  onClose,
  onOpenProfile,
  onSettings,
  onNotify,
}: {
  me: MeDTO;
  server: ServerDTO;
  members: MemberDTO[];
  channels: ChannelDTO[];
  voiceStates: VoiceStates;
  online: Record<string, boolean>;
  open: boolean;
  hidden: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onSettings: () => void;
  onNotify: (message: string) => void;
}) {
  const swipe = useSwipe((toward) => toward === "end" && onClose());
  const notifications = useNotificationPref();
  const liveVoice = channels.filter((c) => c.type === "voice" && voiceStates[c.id]?.length);
  const inVoice = new Set(liveVoice.flatMap((c) => voiceStates[c.id].map((p) => p.id)));
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Higher roles first, then people in voice, then by name.
  const sorted = [...members].sort(
    (a, b) =>
      ROLE_RANK[b.role] - ROLE_RANK[a.role] ||
      Number(inVoice.has(b.user.id)) - Number(inVoice.has(a.user.id)) ||
      a.user.name.localeCompare(b.user.name, "fa"),
  );
  const isOnline = (m: MemberDTO) => m.user.id === me.id || !!online[m.user.id];
  const onlineMembers = sorted.filter(isOnline);
  const offlineMembers = sorted.filter((m) => !isOnline(m));

  const leave = async () => {
    try {
      // The server answers with a "server:removed" event, which takes this server off the screen.
      await api(`/api/servers/${server.id}/members/${me.id}`, { method: "DELETE" });
    } catch (err) {
      onNotify((err as Error).message);
      setConfirmLeave(false);
    }
  };

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
          "scrollbar-thin flex w-[19rem] shrink-0 flex-col overflow-y-auto bg-ink-900 px-5 pb-4 select-none xl:rounded-[1.75rem]",
          "max-xl:fixed max-xl:inset-y-0 max-xl:end-0 max-xl:z-30 max-xl:w-[min(19rem,calc(100vw-3rem))] max-xl:pt-[env(safe-area-inset-top)] max-xl:pb-safe-4 max-xl:shadow-2xl max-xl:transition-[translate,visibility] max-xl:duration-200 max-xl:ease-out",
          !open && "max-xl:invisible ltr:max-xl:translate-x-full rtl:max-xl:-translate-x-full",
          hidden && "xl:hidden",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-ink-800 text-fg">
            <Info className="size-4" />
          </span>
          <h3 className="flex-1 text-sm font-semibold">اطلاعات سرور</h3>
          <button
            onClick={onClose}
            aria-label="بستن"
            title="بستن"
            className="grid size-10 place-items-center rounded-lg text-muted transition-colors hover:bg-ink-800 hover:text-fg active:bg-ink-800"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col items-center pt-3 pb-5 text-center">
          <ServerAvatar name={server.name} className="size-24 rounded-full text-4xl ring-4 ring-ink-800" />
          <h2 className="mt-4 max-w-full truncate text-lg font-bold">{server.name}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {toPersianDigits(members.length)} عضو
            {server.role !== "member" && ` · شما ${ROLE_LABEL[server.role]} این سرور هستید`}
          </p>
        </div>

        <button
          onClick={() => shareInvite(server, onNotify)}
          className="flex items-center justify-between rounded-xl py-3 text-sm font-semibold text-accent transition hover:text-fg"
        >
          دعوت دیگران
          <Plus className="size-4" />
        </button>
        {can(server.role, "server:manage") && (
          <button
            onClick={onSettings}
            className="flex items-center justify-between rounded-xl py-3 text-sm font-semibold text-muted transition hover:text-fg"
          >
            تنظیمات سرور
            <Settings className="size-4" />
          </button>
        )}

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
                <div key={c.id} className="rounded-2xl bg-ink-800 p-3">
                  <p className="mb-2 truncate text-xs text-muted">{c.name}</p>
                  <div className="flex -space-x-2 rtl:space-x-reverse">
                    {voiceStates[c.id].slice(0, 6).map((p) => (
                      <span key={p.id} title={p.name} className="rounded-full ring-2 ring-ink-800">
                        <Avatar user={p} size="sm" />
                      </span>
                    ))}
                    {voiceStates[c.id].length > 6 && (
                      <span className="grid size-6 place-items-center rounded-full bg-ink-700 text-[11px] ring-2 ring-ink-800">
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
        <MemberGroup title="آنلاین" members={onlineMembers} inVoice={inVoice} online={online} meId={me.id} onOpenProfile={onOpenProfile} />
        <MemberGroup title="آفلاین" members={offlineMembers} inVoice={inVoice} online={online} meId={me.id} onOpenProfile={onOpenProfile} dim />

        {server.role !== "owner" && (
          <div className="mt-4 border-t border-line pt-3">
            {confirmLeave ? (
              <div className="rounded-xl bg-danger/10 p-3">
                <p className="mb-2 text-sm">از سرور {server.name} خارج می‌شوید؟</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={leave} className="rounded-xl bg-danger-strong px-3 py-2 text-sm font-semibold text-white hover:bg-danger-strong/90">
                    خروج
                  </button>
                  <button onClick={() => setConfirmLeave(false)} className="rounded-xl bg-ink-800 px-3 py-2 text-sm text-muted hover:text-fg">
                    انصراف
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmLeave(true)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger/10"
              >
                <LogOut className="size-4" />
                ترک سرور
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

function MemberGroup({
  title,
  members,
  inVoice,
  online,
  meId,
  dim,
  onOpenProfile,
}: {
  title: string;
  members: MemberDTO[];
  inVoice: Set<string>;
  online: Record<string, boolean>;
  meId: string;
  dim?: boolean;
  onOpenProfile: (userId: string) => void;
}) {
  if (!members.length) return null;
  return (
    <section className="mb-2">
      <h4 className="py-1.5 text-xs font-semibold text-muted">
        {title} — {toPersianDigits(members.length)}
      </h4>
      <ul className="space-y-0.5">
        {members.map((m) => {
          const muted = isMuted(m.mutedUntil);
          return (
            <li key={m.user.id}>
              <button
                onClick={() => onOpenProfile(m.user.id)}
                className={cn("flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-start transition-colors hover:bg-ink-800", dim && "opacity-60 hover:opacity-100")}
              >
                <Avatar user={m.user} online={m.user.id === meId || !!online[m.user.id]} />
                <div className="min-w-0 flex-1 leading-5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{m.user.name}</span>
                    <RoleIcon role={m.role} />
                    {m.badges.includes("newcomer") && <BadgeIcon id="newcomer" size={18} />}
                    {muted && <BellOff className="size-3.5 shrink-0 text-amber-300" aria-label="بی‌صدا شده" />}
                  </p>
                  <p dir="auto" className="truncate text-xs text-muted">
                    {inVoice.has(m.user.id)
                      ? "در کانال صوتی"
                      : (online[m.user.id] && statusLine(m.user)) || (m.role === "member" ? "عضو" : ROLE_LABEL[m.role])}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Divider() {
  return <div className="h-px shrink-0 bg-line" />;
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
          "absolute top-1 size-4 rounded-full shadow transition-all",
          checked ? "start-6 bg-on-accent" : "start-1 bg-white",
        )}
      />
    </button>
  );
}

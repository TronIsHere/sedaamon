"use client";

import { useState } from "react";
import { useParticipants } from "@livekit/components-react";
import { CalendarClock, ChevronDown, Hash, Link2, Loader2, MessageSquarePlus, MicOff, Plus, Search, Settings, Volume2 } from "lucide-react";
import { cn } from "@/lib/format";
import { shareInvite } from "@/lib/invite";
import { can } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import { statusLine } from "@/lib/status";
import { formatAgo } from "@/lib/format";
import type { ChannelDTO, ChannelType, DmDTO, MeDTO, ServerDetailDTO, VoiceStates } from "@/lib/types";
import { formatEventWhen, isRunning, useNow } from "./EventsDialog";
import type { Unread, VoiceConnection, VoiceSettings } from "./App";
import Avatar from "./Avatar";
import { Badge } from "./ServerRail";
import VoiceControls from "./VoiceControls";

/** What the sidebar shows instead of channels while the direct messages are open. */
export interface DmSidebarProps {
  conversations: DmDTO[];
  activeId: string | null;
  online: Record<string, boolean>;
  onSelect: (dm: DmDTO) => void;
  onNew: () => void;
}

export default function ChannelSidebar({
  me,
  dm,
  detail,
  activeChannelId,
  voiceStates,
  unread,
  connection,
  joiningId,
  settings,
  onSelect,
  onAddChannel,
  onEvents,
  onLeaveVoice,
  onProfile,
  onNotify,
}: {
  me: MeDTO;
  dm?: DmSidebarProps;
  detail: ServerDetailDTO | null;
  activeChannelId: string | null;
  voiceStates: VoiceStates;
  unread: Unread;
  connection: VoiceConnection | null;
  joiningId: string | null;
  settings: VoiceSettings;
  onSelect: (c: ChannelDTO) => void;
  onAddChannel: (type: ChannelType) => void;
  onEvents: () => void;
  onLeaveVoice: () => void;
  onProfile: () => void;
  onNotify: (message: string) => void;
}) {
  // Live mic/speaking state is only known for the channel we are connected to.
  const roomParticipants = useParticipants();
  const live = new Map(roomParticipants.map((p) => [p.identity, p]));

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (c: ChannelDTO) => !q || c.name.toLowerCase().includes(q);
  const dmMatches = (d: DmDTO) => !q || d.peer.name.toLowerCase().includes(q);

  const canManage = !!detail && can(detail.server.role, "channel:manage");
  const text = detail?.channels.filter((c) => c.type === "text" && matches(c)) ?? [];
  const voice = detail?.channels.filter((c) => c.type === "voice" && matches(c)) ?? [];
  const newCount = detail
    ? detail.channels.reduce((n, c) => n + (c.id === activeChannelId ? 0 : (unread[c.id]?.count ?? 0)), 0)
    : 0;

  return (
    <div className="flex w-[17rem] flex-col border-e border-white/5 bg-ink-900 max-md:w-[calc(100vw-72px-3rem)] max-md:max-w-[17rem]">
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <h1 className="truncate text-lg font-bold">{dm ? "پیام‌های مستقیم" : (detail?.server.name ?? "صدامون")}</h1>
        {!dm && newCount > 0 && (
          <span className="shrink-0 text-xs font-semibold text-accent">{toPersianDigits(newCount)} جدید</span>
        )}
        {dm && (
          <button
            onClick={dm.onNew}
            title="پیام تازه"
            aria-label="پیام تازه"
            className="ms-auto rounded-lg p-2 text-accent hover:bg-ink-800 active:bg-ink-800 md:p-1.5"
          >
            <MessageSquarePlus className="size-[18px]" />
          </button>
        )}
        {!dm && detail && (
          <button
            onClick={() => shareInvite(detail.server, onNotify)}
            title="لینک دعوت"
            aria-label="لینک دعوت"
            className="ms-auto rounded-lg p-2 text-accent hover:bg-ink-800 active:bg-ink-800 md:p-1.5"
          >
            <Link2 className="size-[18px]" />
          </button>
        )}
      </div>

      {!dm && detail && <EventsEntry detail={detail} onClick={onEvents} />}

      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 rounded-xl bg-ink-950 px-3 ring-1 ring-white/5 transition focus-within:ring-accent/60">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dm ? "جست‌وجوی گفت‌وگو…" : "جست‌وجوی کانال…"}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted/70"
          />
          <Search className="size-4 shrink-0 text-muted" />
        </label>
      </div>

      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {dm ? (
          <DmList dm={dm} conversations={dm.conversations.filter(dmMatches)} unread={unread} searching={!!q} />
        ) : !detail ? (
          <SidebarSkeleton />
        ) : (
          <>
            <Section title="کانال‌های متنی" canAdd={canManage} onAdd={() => onAddChannel("text")}>
              {text.map((c) => {
                const count = c.id === activeChannelId ? 0 : (unread[c.id]?.count ?? 0);
                const pinged = c.id === activeChannelId ? 0 : (unread[c.id]?.mentions ?? 0);
                return (
                  <ChannelButton key={c.id} active={c.id === activeChannelId} onClick={() => onSelect(c)}>
                    <Hash className="size-4 shrink-0 opacity-70" />
                    <span className={cn("truncate", count > 0 && "font-semibold text-fg")}>{c.name}</span>
                    {count > 0 && <Badge count={pinged || count} ping={pinged > 0} className="ms-auto" />}
                  </ChannelButton>
                );
              })}
            </Section>

            <Section title="کانال‌های صوتی" canAdd={canManage} onAdd={() => onAddChannel("voice")}>
              {voice.map((c) => {
                const connectedHere = connection?.channelId === c.id;
                const people = voiceStates[c.id] ?? [];
                return (
                  <div key={c.id}>
                    <ChannelButton active={c.id === activeChannelId} onClick={() => onSelect(c)}>
                      {joiningId === c.id ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                      ) : (
                        <Volume2 className={cn("size-4 shrink-0 opacity-70", connectedHere && "text-online opacity-100")} />
                      )}
                      <span className={cn("truncate", people.length > 0 && "font-semibold text-fg")}>{c.name}</span>
                      {people.length > 0 && (
                        <span className="ms-auto text-[11px] text-muted">{toPersianDigits(people.length)}</span>
                      )}
                    </ChannelButton>
                    {people.length > 0 && (
                      <ul className="ms-5 space-y-0.5 border-s border-white/5 py-1 ps-2">
                        {people.map((p) => {
                          const lp = connectedHere ? live.get(p.id) : undefined;
                          return (
                            <li key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted">
                              <Avatar user={p} size="sm" speaking={lp?.isSpeaking} />
                              <span className={cn("truncate", lp?.isSpeaking && "text-fg")}>{p.name}</span>
                              {lp && !lp.isMicrophoneEnabled && <MicOff className="ms-auto size-3.5 shrink-0 text-danger/80" />}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </Section>
            {q && !text.length && !voice.length && <p className="px-2 text-center text-sm text-muted">کانالی پیدا نشد</p>}
          </>
        )}
      </div>

      {connection && (
        <div className="mx-3 mb-2 rounded-2xl bg-ink-850 p-3 ring-1 ring-white/5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-online/15 text-online">
              <Volume2 className="size-4" />
            </span>
            <div className="min-w-0 flex-1 text-xs leading-5">
              <p className="font-semibold text-online">متصل به صدا</p>
              <p className="truncate text-muted">
                {connection.channelName} / {connection.serverName}
              </p>
            </div>
          </div>
          <div className="mt-2.5">
            <VoiceControls settings={settings} onLeave={onLeaveVoice} compact />
          </div>
        </div>
      )}

      <button
        onClick={onProfile}
        className="group flex items-center gap-3 border-t border-white/5 px-4 pt-3 pb-safe-4 text-start hover:bg-ink-850"
      >
        <Avatar user={me} online />
        <span className="min-w-0 flex-1 text-sm leading-5">
          <span className="block truncate font-semibold">{me.name}</span>
          <span dir="auto" className="block truncate text-xs text-muted">
            {statusLine(me) || "حساب کاربری"}
          </span>
        </span>
        <Settings className="size-4 shrink-0 text-muted transition group-hover:rotate-45 group-hover:text-fg" />
      </button>
    </div>
  );
}

/** One line under the server name: the next event, or an invitation to schedule the first. Hidden when there is nothing to show. */
function EventsEntry({ detail, onClick }: { detail: ServerDetailDTO; onClick: () => void }) {
  const now = useNow();
  const next = detail.events.find((e) => isRunning(e, now) || new Date(e.startsAt).getTime() > now);
  if (!next && !can(detail.server.role, "event:manage")) return null;
  const running = !!next && isRunning(next, now);
  return (
    <div className="px-3 pb-2">
      <button
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm ring-1 transition hover:bg-ink-850",
          running ? "bg-online/10 ring-online/30" : "bg-ink-950 ring-white/5",
        )}
      >
        <CalendarClock className={cn("size-4 shrink-0", running ? "text-online" : "text-accent")} />
        <span className="min-w-0 flex-1 leading-5">
          <span className="block truncate font-semibold">{next ? next.title : "رویدادها"}</span>
          <span className={cn("block truncate text-xs", running ? "text-online" : "text-muted")}>
            {next ? (running ? "در حال برگزاری" : formatEventWhen(next.startsAt)) : "اولین رویداد را زمان‌بندی کنید"}
          </span>
        </span>
        {detail.events.length > 1 && <span className="text-xs text-muted">+{toPersianDigits(detail.events.length - 1)}</span>}
      </button>
    </div>
  );
}

function DmList({
  dm,
  conversations,
  unread,
  searching,
}: {
  dm: DmSidebarProps;
  conversations: DmDTO[];
  unread: Unread;
  searching: boolean;
}) {
  if (!conversations.length) {
    return (
      <div className="px-2 py-10 text-center text-sm leading-7 text-muted">
        {searching ? (
          "گفت‌وگویی پیدا نشد"
        ) : (
          <>
            هنوز گفت‌وگویی ندارید.
            <br />
            روی نام یکی از اعضا یا دوستانتان بزنید و «ارسال پیام» را انتخاب کنید.
          </>
        )}
      </div>
    );
  }
  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => {
        const count = c.id === dm.activeId ? 0 : (unread[c.id]?.count ?? 0);
        const online = !!dm.online[c.peer.id];
        const line = (online && statusLine(c.peer)) || (c.lastMessageAt ? formatAgo(c.lastMessageAt) : "");
        return (
          <li key={c.id}>
            <ChannelButton active={c.id === dm.activeId} onClick={() => dm.onSelect(c)}>
              <Avatar user={c.peer} online={online} />
              <span className="min-w-0 flex-1 leading-5">
                <span className={cn("block truncate", count > 0 && "font-semibold text-fg")}>{c.peer.name}</span>
                {line && (
                  <span dir="auto" className="block truncate text-xs text-muted">
                    {line}
                  </span>
                )}
              </span>
              {count > 0 && <Badge count={count} className="ms-auto" />}
            </ChannelButton>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarSkeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden>
      <div className="mb-3 h-3 w-24 rounded-full bg-ink-800" />
      {[70, 55, 80, 45].map((w) => (
        <div key={w} className="flex items-center gap-2 px-3 py-2">
          <span className="size-4 rounded bg-ink-800" />
          <span className="h-3 rounded-full bg-ink-800" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  canAdd,
  onAdd,
  children,
}: {
  title: string;
  canAdd: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-1 text-xs font-semibold text-muted">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 hover:text-fg" aria-expanded={open}>
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "ltr:-rotate-90 rtl:rotate-90")} />
          {title}
        </button>
        {canAdd && (
          <button onClick={onAdd} title="ساختن کانال" aria-label="ساختن کانال" className="-m-1.5 p-1.5 text-accent hover:text-fg">
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {open && <div className="space-y-0.5">{children}</div>}
    </section>
  );
}

function ChannelButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-sm transition md:py-2",
        active ? "bg-ink-800 font-semibold text-fg" : "text-muted hover:bg-ink-850 hover:text-fg active:bg-ink-850",
      )}
    >
      {children}
    </button>
  );
}

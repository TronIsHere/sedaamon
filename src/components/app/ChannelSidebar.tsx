"use client";

import { useState } from "react";
import { useParticipants } from "@livekit/components-react";
import { CalendarClock, ChevronDown, Hash, Link2, Loader2, Lock, MessageSquarePlus, MicOff, Plus, Search, Volume2 } from "lucide-react";
import { cn } from "@/lib/format";
import { shareInvite } from "@/lib/invite";
import { can } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import { foldForSearch, matchesSearch } from "@/lib/search";
import { statusLine } from "@/lib/status";
import { formatAgo } from "@/lib/format";
import type { ChannelDTO, ChannelType, DmDTO, MeDTO, ServerDetailDTO, VoiceStates } from "@/lib/types";
import { formatEventWhen, isRunning, useNow } from "./EventsDialog";
import type { Unread, VoiceConnection, VoiceSettings } from "./App";
import Skeleton from "@/components/ui/skeleton";
import Avatar from "./Avatar";
import ProfileMenu from "./ProfileMenu";
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
  onMeChange,
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
  /** Opens the account settings (name, picture); status and bio change in the popover. */
  onProfile: () => void;
  onMeChange: (me: MeDTO) => void;
  onNotify: (message: string) => void;
}) {
  // Live mic/speaking state is only known for the channel we are connected to.
  const roomParticipants = useParticipants();
  const live = new Map(roomParticipants.map((p) => [p.identity, p]));

  const [query, setQuery] = useState("");
  const q = foldForSearch(query.trim());
  const matches = (c: ChannelDTO) => matchesSearch(c.name, q);
  const dmMatches = (d: DmDTO) => matchesSearch(d.peer.name, q);

  const canManage = !!detail && can(detail.server.role, "channel:manage");
  const text = detail?.channels.filter((c) => c.type === "text" && matches(c)) ?? [];
  const voice = detail?.channels.filter((c) => c.type === "voice" && matches(c)) ?? [];
  const newCount = detail
    ? detail.channels.reduce((n, c) => n + (c.id === activeChannelId ? 0 : (unread[c.id]?.count ?? 0)), 0)
    : 0;

  return (
    <div className="flex w-[17.5rem] flex-col gap-2 bg-ink-950 max-md:w-[calc(100vw-76px-3rem)] max-md:max-w-[17.5rem] max-md:px-2 max-md:pt-2">
      <div className="flex h-14 shrink-0 items-center gap-2 ps-3 pe-1">
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{dm ? "پیام‌های مستقیم" : (detail?.server.name ?? "صدامون")}</h1>
        {!dm && newCount > 0 && (
          <span className="shrink-0 text-xs font-semibold text-accent">{toPersianDigits(newCount)} جدید</span>
        )}
        {dm && (
          <button
            onClick={dm.onNew}
            title="پیام تازه"
            aria-label="پیام تازه"
            className="ms-auto grid size-10 shrink-0 place-items-center rounded-full bg-ink-900 text-fg transition-colors hover:bg-ink-800 active:bg-ink-700"
          >
            <MessageSquarePlus className="size-[18px]" />
          </button>
        )}
        {!dm && detail && (
          <button
            onClick={() => shareInvite(detail.server, onNotify)}
            title="لینک دعوت"
            aria-label="لینک دعوت"
            className="ms-auto grid size-10 shrink-0 place-items-center rounded-full bg-ink-900 text-fg transition-colors hover:bg-ink-800 active:bg-ink-700"
          >
            <Link2 className="size-[18px]" />
          </button>
        )}
      </div>

      {!dm && detail && <EventsEntry detail={detail} onClick={onEvents} />}

      <div>
        <label className="flex items-center gap-2 rounded-full bg-ink-900 px-4 transition focus-within:ring-2 focus-within:ring-accent/70">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dm ? "جست‌وجوی گفت‌وگو…" : "جست‌وجوی کانال…"}
            aria-label={dm ? "جست‌وجوی گفت‌وگو" : "جست‌وجوی کانال"} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted"
          />
          <Search className="size-4 shrink-0 text-muted" />
        </label>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto">
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
                    {c.isPrivate ? <Lock className="size-4 shrink-0 opacity-70" aria-label="کانال خصوصی" /> : <Hash className="size-4 shrink-0 opacity-70" />}
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
                      {c.isPrivate && <Lock className="size-3 shrink-0 opacity-60" aria-label="کانال خصوصی" />}
                      {people.length > 0 && (
                        <span className="ms-auto text-xs text-muted">{toPersianDigits(people.length)}</span>
                      )}
                    </ChannelButton>
                    {people.length > 0 && (
                      <ul className="ms-4 space-y-0.5 py-1 ps-2">
                        {people.map((p) => {
                          const lp = connectedHere ? live.get(p.id) : undefined;
                          return (
                            <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted">
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
        <div className="rounded-[1.75rem] bg-ink-900 p-3 ring-1 ring-online/25">
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

      <ProfileMenu me={me} side="top" onMeChange={onMeChange} onSettings={onProfile} onNotify={onNotify}>
        {(trigger) => (
          <button
            {...trigger}
            className="group mb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-3 rounded-[1.75rem] bg-ink-900 px-3 py-2.5 text-start transition-colors hover:bg-ink-800 aria-expanded:bg-ink-800 md:mb-0"
          >
            <Avatar user={me} online />
            <span className="min-w-0 flex-1 text-sm leading-5">
              <span className="block truncate font-semibold">{me.name}</span>
              <span dir="auto" className="block truncate text-xs text-muted">
                {statusLine(me) || "وضعیت خود را بگذارید"}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 rotate-180 text-muted transition group-aria-expanded:rotate-0" />
          </button>
        )}
      </ProfileMenu>
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
    <div>
      <button
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-[1.75rem] px-4 py-3 text-start text-sm transition-colors",
          running ? "bg-online/10 ring-1 ring-online/30 hover:bg-online/15" : "bg-ink-900 hover:bg-ink-800",
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
    <ul className="space-y-2">
      {conversations.map((c) => {
        const count = c.id === dm.activeId ? 0 : (unread[c.id]?.count ?? 0);
        const online = !!dm.online[c.peer.id];
        const line = (online && statusLine(c.peer)) || (c.lastMessageAt ? formatAgo(c.lastMessageAt) : "");
        return (
          <li key={c.id}>
            <ChannelButton card active={c.id === dm.activeId} onClick={() => dm.onSelect(c)}>
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
    <div className="space-y-2" aria-hidden>
      <Skeleton className="mb-3 h-3 w-24 rounded-full" />
      {[70, 55, 80, 45].map((w) => (
        <div key={w} className="flex items-center gap-2 px-3 py-2">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-3 rounded-full" style={{ width: `${w}%` }} />
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
    <section className="rounded-[1.75rem] bg-ink-900 px-2 py-2.5">
      <div className="flex items-center justify-between ps-2 pe-0.5">
        <button onClick={() => setOpen(!open)} className="flex min-h-9 items-center gap-1.5 rounded-lg text-[15px] font-semibold text-fg transition-colors hover:text-accent" aria-expanded={open}>
          {title}
          <ChevronDown className={cn("size-4 text-muted transition-transform", !open && "ltr:-rotate-90 rtl:rotate-90")} />
        </button>
        {canAdd && (
          <button onClick={onAdd} title="ساختن کانال" aria-label="ساختن کانال" className="grid size-9 place-items-center rounded-full text-fg transition-colors hover:bg-ink-800">
            <Plus className="size-5" />
          </button>
        )}
      </div>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </section>
  );
}

/** A channel row inside a section card, or (`card`) a conversation that is its own card. */
function ChannelButton({
  active,
  card,
  onClick,
  children,
}: {
  active: boolean;
  card?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex w-full items-center gap-2.5 text-start text-sm transition-colors duration-150",
        card ? "min-h-14 rounded-[1.25rem] px-3 py-2.5" : "min-h-11 rounded-xl px-3 py-2 md:min-h-10",
        active
          ? "bg-ink-700 font-semibold text-fg"
          : cn("text-fg/80 hover:bg-ink-800 hover:text-fg active:bg-ink-700", card && "bg-ink-900"),
      )}
    >
      {children}
    </button>
  );
}

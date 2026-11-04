"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, Check, Pencil, Trash2, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatTime } from "@/lib/format";
import { faDigits, formatJalali } from "@/lib/jalali";
import { can } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import type { ChannelDTO, EventDTO, ServerDTO } from "@/lib/types";
import { inputClass, Modal, SubmitButton, useSubmit } from "./Dialogs";
import Select from "@/components/ui/select";
import JalaliDatePicker from "./JalaliDatePicker";

/** The event is "on" from its start until this long after it. Matches the server's list window. */
const RUNNING_MS = 3 * 60 * 60_000;
const SOON_MS = 10 * 60_000;

export const isRunning = (e: EventDTO, now = Date.now()) => {
  const start = new Date(e.startsAt).getTime();
  return start <= now && now < start + RUNNING_MS;
};

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** «۲ ساعت دیگر», «فردا», «در حال برگزاری». */
export function startsIn(e: EventDTO, now: number) {
  if (isRunning(e, now)) return "در حال برگزاری";
  const minutes = Math.round((new Date(e.startsAt).getTime() - now) / 60_000);
  if (minutes < 1) return "لحظاتی دیگر";
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقهٔ دیگر`;
  if (minutes < 60 * 24) return `${toPersianDigits(Math.round(minutes / 60))} ساعت دیگر`;
  return `${toPersianDigits(Math.round(minutes / (60 * 24)))} روز دیگر`;
}

export const formatEventWhen = (iso: string) => `${formatJalali(new Date(iso), { weekday: true, year: false })} · ${formatTime(iso)}`;

type View = { kind: "list" } | { kind: "form"; event?: EventDTO };

export default function EventsDialog({
  server,
  events,
  channels,
  meId,
  onClose,
  onJoin,
  onNotify,
}: {
  server: ServerDTO;
  events: EventDTO[];
  channels: ChannelDTO[];
  meId: string;
  onClose: () => void;
  /** Opens (and joins) the event's voice channel. */
  onJoin: (channel: ChannelDTO) => void;
  onNotify: (message: string) => void;
}) {
  const canManage = can(server.standing, "event:manage");
  // Events are for the whole server, so a private room can't be their meeting place.
  const voice = channels.filter((c) => c.type === "voice" && !c.isPrivate);
  const [view, setView] = useState<View>(events.length || !canManage ? { kind: "list" } : { kind: "form" });

  if (view.kind === "form") {
    return (
      <Modal title={view.event ? "ویرایش رویداد" : "رویداد تازه"} onClose={onClose}>
        <EventForm
          server={server}
          event={view.event}
          voice={voice}
          onCancel={() => (events.length || view.event ? setView({ kind: "list" }) : onClose())}
          onDone={() => setView({ kind: "list" })}
        />
      </Modal>
    );
  }

  return (
    <Modal title="رویدادها" onClose={onClose}>
      <EventList
        events={events}
        channels={channels}
        canManage={canManage}
        meId={meId}
        onEdit={(event) => setView({ kind: "form", event })}
        onJoin={(c) => {
          onJoin(c);
          onClose();
        }}
        onNotify={onNotify}
      />
      {canManage && (
        <button
          onClick={() => setView({ kind: "form" })}
          className="btn-primary mt-4 w-full"
        >
          <CalendarPlus className="size-4" />
          رویداد تازه
        </button>
      )}
    </Modal>
  );
}

function EventList({
  events,
  channels,
  canManage,
  meId,
  onEdit,
  onJoin,
  onNotify,
}: {
  events: EventDTO[];
  channels: ChannelDTO[];
  canManage: boolean;
  meId: string;
  onEdit: (event: EventDTO) => void;
  onJoin: (channel: ChannelDTO) => void;
  onNotify: (message: string) => void;
}) {
  const now = useNow();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // The server only trims its list when it is asked again, so hide what has long finished.
  events = events.filter((e) => new Date(e.startsAt).getTime() + RUNNING_MS > now);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  if (!events.length) {
    return (
      <div className="py-10 text-center text-muted">
        <CalendarClock className="mx-auto size-9" />
        <p className="mt-3 text-sm leading-7">رویدادی زمان‌بندی نشده است.{canManage && " یکی بسازید تا اعضا در کانال صوتی جمع شوند."}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {events.map((e) => {
        const channel = channels.find((c) => c.id === e.channelId);
        const running = isRunning(e, now);
        const soon = !running && new Date(e.startsAt).getTime() - now <= SOON_MS;
        const going = e.interested.includes(meId);
        return (
          <li key={e.id} className={cn("rounded-2xl bg-ink-850 p-4 ring-1", running ? "ring-online/40" : "ring-line")}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 dir="auto" className="font-bold break-words">
                  {e.title}
                </h3>
                <p className="mt-1 text-sm text-muted">{formatEventWhen(e.startsAt)}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                  running ? "bg-online/15 text-online" : soon ? "bg-accent-strong/20 text-accent" : "bg-ink-800 text-muted",
                )}
              >
                {startsIn(e, now)}
              </span>
            </div>

            {e.description && (
              <p dir="auto" className="bidi-lines mt-2 text-sm leading-7 whitespace-pre-wrap break-words text-fg/90">
                {e.description}
              </p>
            )}

            {channel && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Volume2 className="size-3.5" />
                {channel.name}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {channel && (running || soon) && (
                <button
                  onClick={() => onJoin(channel)}
                  className="flex items-center gap-1.5 rounded-xl bg-online/15 px-3 py-2 text-sm font-semibold text-online hover:bg-online/25"
                >
                  <Volume2 className="size-4" />
                  پیوستن
                </button>
              )}
              <button
                disabled={busyId === e.id}
                onClick={() => run(e.id, () => api(`/api/events/${e.id}/interest`, { method: "PUT" }))}
                aria-pressed={going}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60",
                  going ? "bg-accent-strong text-on-accent" : "bg-ink-800 text-muted hover:text-fg",
                )}
              >
                {going && <Check className="size-4" />}
                {going ? "می‌آیم" : "علاقه‌مندم"}
                <span className="text-xs font-normal opacity-80">({toPersianDigits(e.interested.length)})</span>
              </button>
              {canManage && (
                <span className="ms-auto flex gap-1">
                  <button onClick={() => onEdit(e)} aria-label="ویرایش رویداد" title="ویرایش" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ink-800 hover:text-fg">
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => setConfirmId(e.id)}
                    aria-label="لغو رویداد"
                    title="لغو رویداد"
                    className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </span>
              )}
            </div>

            {confirmId === e.id && (
              <div className="mt-3 rounded-xl bg-danger/10 p-3">
                <p className="mb-2 text-sm">رویداد «{e.title}» لغو شود؟</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={busyId === e.id}
                    onClick={() => run(e.id, () => api(`/api/events/${e.id}`, { method: "DELETE" }))}
                    className="rounded-xl bg-danger-strong px-3 py-2 text-sm font-semibold text-white hover:bg-danger-strong/90 disabled:opacity-60"
                  >
                    لغو رویداد
                  </button>
                  <button onClick={() => setConfirmId(null)} className="rounded-xl bg-ink-800 px-3 py-2 text-sm text-muted hover:text-fg">
                    انصراف
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, "0");

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(21, 0, 0, 0);
  return d;
}

function EventForm({
  server,
  event,
  voice,
  onCancel,
  onDone,
}: {
  server: ServerDTO;
  event?: EventDTO;
  voice: ChannelDTO[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const initial = event ? new Date(event.startsAt) : defaultStart();
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [day, setDay] = useState<Date | null>(initial);
  const [hour, setHour] = useState(initial.getHours());
  const [minute, setMinute] = useState(Math.floor(initial.getMinutes() / 5) * 5);
  const [channelId, setChannelId] = useState(event?.channelId && voice.some((c) => c.id === event.channelId) ? event.channelId : (voice[0]?.id ?? ""));

  const startsAt = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute) : null;
  const { busy, error, submit } = useSubmit(
    () => {
      const body = { title, description, startsAt: startsAt!.toISOString(), channelId: channelId || null };
      return event
        ? api(`/api/events/${event.id}`, { method: "PATCH", body })
        : api(`/api/servers/${server.id}/events`, { method: "POST", body });
    },
    onDone,
  );

  const selectClass = "text-center tabular-nums";

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm text-muted">عنوان</span>
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="مثلاً «شب بازی»" autoFocus />
      </label>

      <div className="space-y-1.5">
        <span className="text-sm text-muted">تاریخ</span>
        <JalaliDatePicker label="تاریخ رویداد" value={day} onChange={setDay} min={event ? undefined : new Date()} />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm text-muted">ساعت</span>
        <div className="grid grid-cols-2 gap-2" dir="ltr">
          <Select className={selectClass} value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="ساعت">
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {faDigits(pad(h))}
              </option>
            ))}
          </Select>
          <Select className={selectClass} value={minute} onChange={(e) => setMinute(Number(e.target.value))} aria-label="دقیقه">
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {faDigits(pad(m))}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {voice.length > 0 && (
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">کانال صوتی</span>
          <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {voice.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">بدون کانال</option>
          </Select>
        </label>
      )}

      <label className="block space-y-1.5">
        <span className="flex justify-between text-sm text-muted">
          توضیحات (اختیاری)
          <span className="text-xs">
            {toPersianDigits(description.length)}/{toPersianDigits(300)}
          </span>
        </span>
        <textarea
          className={cn(inputClass, "bidi-lines field-sizing-content max-h-40 min-h-20 resize-none leading-7")}
          dir="auto"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
        />
      </label>

      {startsAt && <p className="text-sm text-muted">برگزار می‌شود: {formatEventWhen(startsAt.toISOString())}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <SubmitButton busy={busy} disabled={title.trim().length < 2 || !startsAt}>
          {event ? "ذخیره" : "زمان‌بندی رویداد"}
        </SubmitButton>
        <button type="button" onClick={onCancel} className="rounded-xl bg-ink-800 px-4 text-sm text-muted hover:text-fg">
          انصراف
        </button>
      </div>
    </form>
  );
}

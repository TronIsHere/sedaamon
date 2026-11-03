import type { Types } from "mongoose";
import type { EventAlert, EventDTO } from "@/lib/types";
import { HttpError } from "./errors";
import { Channel, Event, User } from "./models";
import { emitToServer, emitToUsers } from "./realtime";
import { toUser } from "./serialize";

/** Alerts go out this long before an event starts. */
const SOON_MS = 10 * 60_000;
/** An event stays in the list this long after it began, since people are still joining. */
const LINGER_MS = 3 * 60 * 60_000;
/** After a long outage, don't announce events that started long ago. */
const STALE_MS = 30 * 60_000;
const KEEP_AFTER_START_MS = 7 * 24 * 60 * 60_000;

interface EventDoc {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  title: string;
  description?: string;
  startsAt: Date;
  channel?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  interested: Types.ObjectId[];
}

export async function serializeEvents(docs: EventDoc[]): Promise<EventDTO[]> {
  const users = await User.find({ _id: { $in: [...new Set(docs.map((d) => String(d.createdBy)))] } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), toUser(u)]));
  return docs.map((e) => ({
    id: String(e._id),
    serverId: String(e.server),
    title: e.title,
    description: e.description ?? "",
    startsAt: e.startsAt.toISOString(),
    channelId: e.channel ? String(e.channel) : null,
    createdBy: byId.get(String(e.createdBy)) ?? null,
    interested: e.interested.map(String),
  }));
}

export async function listEvents(serverId: string): Promise<EventDTO[]> {
  const docs = await Event.find({ server: serverId, startsAt: { $gte: new Date(Date.now() - LINGER_MS) } })
    .sort({ startsAt: 1 })
    .limit(50)
    .lean();
  return serializeEvents(docs);
}

export interface EventInput {
  title: string;
  description: string;
  startsAt: Date;
  channelId: string | null;
}

/** Checks the fields an organiser sends; throws a Persian message the form can show. */
export async function validateEvent(serverId: string, input: EventInput, { creating }: { creating: boolean }) {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 60) throw new HttpError(400, "عنوان رویداد باید بین ۲ تا ۶۰ حرف باشد");
  const description = input.description.trim();
  if (description.length > 300) throw new HttpError(400, "توضیحات نباید بیشتر از ۳۰۰ حرف باشد");
  if (Number.isNaN(input.startsAt.getTime())) throw new HttpError(400, "زمان رویداد درست نیست");
  if (creating && input.startsAt.getTime() < Date.now() - 60_000) throw new HttpError(400, "زمان رویداد باید در آینده باشد");
  if (input.startsAt.getTime() > Date.now() + 366 * 24 * 60 * 60_000) throw new HttpError(400, "رویداد را حداکثر یک سال جلوتر می‌توان زمان‌بندی کرد");
  if (input.channelId) {
    const channel = await Channel.findOne({ _id: input.channelId, server: serverId, type: "voice" }, { _id: 1 }).lean();
    if (!channel) throw new HttpError(400, "کانال صوتی انتخاب‌شده در این سرور نیست");
  }
  return { title, description };
}

export const eventFields = (input: EventInput, clean: { title: string; description: string }) => ({
  title: clean.title,
  description: clean.description,
  startsAt: input.startsAt,
  channel: input.channelId,
  expiresAt: new Date(input.startsAt.getTime() + KEEP_AFTER_START_MS),
});

export async function broadcastEvent(kind: "new" | "update", doc: EventDoc) {
  const [event] = await serializeEvents([doc]);
  emitToServer(event.serverId, `event:${kind}`, event);
  return event;
}

/** Marks one kind of alert as sent and returns the event only if this call was the one that marked it. */
async function claim(id: Types.ObjectId, field: "remindedAt" | "startedAt") {
  return Event.findOneAndUpdate({ _id: id, [field]: null }, { [field]: new Date() }, { new: true }).lean();
}

async function alertOnce(doc: EventDoc, kind: EventAlert["kind"]) {
  const [event] = await serializeEvents([doc]);
  const alert: EventAlert = { kind, event };
  if (kind === "start") {
    // Starting is news for the whole server.
    emitToServer(event.serverId, "event:alert", alert);
  } else {
    // "Soon" only reaches the people who said they would come, and the organiser.
    emitToUsers([...new Set([...event.interested, ...(event.createdBy ? [event.createdBy.id] : [])])], "event:alert", alert);
  }
}

export async function runEventScheduler() {
  const now = Date.now();

  const dueSoon = await Event.find({ remindedAt: null, startsAt: { $lte: new Date(now + SOON_MS), $gt: new Date(now) } }).lean();
  for (const e of dueSoon) {
    const claimed = await claim(e._id, "remindedAt");
    if (claimed) await alertOnce(claimed, "soon");
  }

  const dueStart = await Event.find({ startedAt: null, startsAt: { $lte: new Date(now) } }).lean();
  for (const e of dueStart) {
    const claimed = await claim(e._id, "startedAt");
    if (!claimed) continue;
    // Events that began while the server was down are marked but not announced.
    if (now - claimed.startsAt.getTime() <= STALE_MS) await alertOnce(claimed, "start");
    if (!claimed.remindedAt) await Event.updateOne({ _id: e._id }, { remindedAt: new Date() });
  }
}

export function startEventScheduler() {
  const tick = () => runEventScheduler().catch((err) => console.error("[events]", err));
  tick();
  return setInterval(tick, 20_000);
}

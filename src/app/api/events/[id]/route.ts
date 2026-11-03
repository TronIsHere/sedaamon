import { z } from "zod";
import { broadcastEvent, eventFields, validateEvent } from "@/server/events";
import { assertId, assertPermission, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Event } from "@/server/models";
import { emitToServer } from "@/server/realtime";

type Ctx = RouteContext<"/api/events/[id]">;

async function loadForManager(id: string, userId: Parameters<typeof requireMember>[1]) {
  const event = await Event.findById(assertId(id));
  if (!event) throw new HttpError(404, "رویداد پیدا نشد");
  const member = await requireMember(String(event.server), userId);
  assertPermission(member, "event:manage", "فقط مالک و مدیران سرور می‌توانند رویداد را تغییر دهند");
  return event;
}

export const PATCH = handle(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const event = await loadForManager(id, user._id);

  const body = z
    .object({ title: z.string(), description: z.string().default(""), startsAt: z.iso.datetime(), channelId: z.string().nullable().default(null) })
    .parse(await req.json());
  const input = { ...body, startsAt: new Date(body.startsAt) };
  // Only a new time has to be in the future; renaming an event that already started is fine.
  const timeChanged = input.startsAt.getTime() !== event.startsAt.getTime();
  const clean = await validateEvent(String(event.server), input, { creating: timeChanged });

  Object.assign(event, eventFields(input, clean));
  // A new time means the alerts should fire again.
  if (timeChanged) {
    event.remindedAt = null;
    event.startedAt = null;
  }
  await event.save();
  return { event: await broadcastEvent("update", event.toObject()) };
});

export const DELETE = handle(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const event = await loadForManager(id, user._id);
  await Event.deleteOne({ _id: event._id });
  emitToServer(String(event.server), "event:delete", { serverId: String(event.server), eventId: id });
  return { ok: true };
});

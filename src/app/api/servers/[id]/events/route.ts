import { z } from "zod";
import { broadcastEvent, eventFields, listEvents, validateEvent } from "@/server/events";
import { assertPermission, handle, requireMember, requireUser } from "@/server/http";
import { Event } from "@/server/models";

export const GET = handle(async (_req, ctx: RouteContext<"/api/servers/[id]/events">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireMember(id, user._id);
  return { events: await listEvents(id) };
});

const eventBody = z.object({
  title: z.string(),
  description: z.string().default(""),
  startsAt: z.iso.datetime(),
  channelId: z.string().nullable().default(null),
});

export const POST = handle(async (req, ctx: RouteContext<"/api/servers/[id]/events">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  assertPermission(member, "event:manage", "فقط مالک و مدیران سرور می‌توانند رویداد بسازند");

  const body = eventBody.parse(await req.json());
  const input = { ...body, startsAt: new Date(body.startsAt) };
  const clean = await validateEvent(id, input, { creating: true });
  const doc = await Event.create({ server: id, createdBy: user._id, interested: [user._id], ...eventFields(input, clean) });
  return { event: await broadcastEvent("new", doc.toObject()) };
});

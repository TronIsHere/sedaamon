import { Types } from "mongoose";
import { broadcastEvent } from "@/server/events";
import { assertId, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Event } from "@/server/models";

/** Toggles "I'll be there" for the caller. */
export const PUT = handle(async (_req, ctx: RouteContext<"/api/events/[id]/interest">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const found = await Event.findById(assertId(id), { server: 1 }).lean();
  if (!found) throw new HttpError(404, "رویداد پیدا نشد");
  await requireMember(String(found.server), user._id);

  const uid = user._id as Types.ObjectId;
  const removed = await Event.updateOne({ _id: id, interested: uid }, { $pull: { interested: uid } });
  if (!removed.modifiedCount) await Event.updateOne({ _id: id }, { $addToSet: { interested: uid } });

  const event = await Event.findById(id).lean();
  if (!event) throw new HttpError(404, "رویداد پیدا نشد");
  return { event: await broadcastEvent("update", event) };
});

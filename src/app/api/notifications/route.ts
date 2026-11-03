import { z } from "zod";
import { viewableChannelIds } from "@/server/access";
import { assertId, handle, requireUser } from "@/server/http";
import { Notification } from "@/server/models";
import { serializeNotifications } from "@/server/notifications";

const LIMIT = 100;

/** Your latest pings, newest first. */
export const GET = handle(async () => {
  const user = await requireUser();
  const rows = await Notification.find({ user: user._id }).sort({ _id: -1 }).limit(LIMIT).lean();
  // Pings from a private channel stop showing once you lose access to it.
  const viewable = await viewableChannelIds(user._id, rows.map((r) => r.channel));
  return { notifications: await serializeNotifications(rows.filter((r) => viewable.has(String(r.channel)))) };
});

/** Marks pings as read: those of one channel, or all of them. */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const { channelId } = z.object({ channelId: z.string().optional() }).parse(await req.json());
  await Notification.updateMany(
    { user: user._id, readAt: null, ...(channelId ? { channel: assertId(channelId) } : {}) },
    { readAt: new Date() },
  );
  return { ok: true };
});

/** Clears the list. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  await Notification.deleteMany({ user: user._id });
  return { ok: true };
});

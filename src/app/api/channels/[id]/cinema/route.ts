import { assertCanWrite, handle, requireChannelAccess, requireUser } from "@/server/http";
import { assertCinema, cinemaSnapshot, controlCinema, controlInput } from "@/server/cinema";

/** The cinema's library and what it is showing. */
export const GET = handle(async (_req, ctx: RouteContext<"/api/channels/[id]/cinema">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { channel } = await requireChannelAccess(id, user._id);
  assertCinema(channel);
  return cinemaSnapshot(channel, user);
});

/** Picks a film, plays, pauses, seeks or stops it for everyone in the room. */
export const POST = handle(async (req, ctx: RouteContext<"/api/channels/[id]/cinema">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { channel, member } = await requireChannelAccess(id, user._id);
  assertCinema(channel);
  assertCanWrite(member);
  const state = await controlCinema(channel, user.name || "یکی از اعضا", controlInput.parse(await req.json()));
  return { state, serverNow: Date.now() };
});

import { z } from "zod";
import { handle, HttpError, requireChannelAccess, requireUser } from "@/server/http";
import { createVoiceToken, publicLiveKitUrl } from "@/server/livekit";
import { toUser } from "@/server/serialize";

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { channelId } = z.object({ channelId: z.string() }).parse(await req.json());
  const { channel } = await requireChannelAccess(channelId, user._id);
  if (channel.type !== "voice") throw new HttpError(400, "این کانال صوتی نیست");

  return { token: await createVoiceToken(channelId, toUser(user)), url: publicLiveKitUrl(req) };
});

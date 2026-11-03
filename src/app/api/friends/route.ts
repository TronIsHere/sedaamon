import { z } from "zod";
import { handle, requireUser } from "@/server/http";
import { listFriends, sendFriendRequest } from "@/server/friends";

export const GET = handle(async () => listFriends((await requireUser())._id));

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { userId } = z.object({ userId: z.string() }).parse(await req.json());
  return { friendState: await sendFriendRequest(user._id, userId) };
});

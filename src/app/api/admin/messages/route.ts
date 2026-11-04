import { isValidObjectId } from "mongoose";
import { listMessagesForAdmin } from "@/server/admin";
import { handle, requireAdmin } from "@/server/http";

export const GET = handle(async (req) => {
  await requireAdmin();
  const params = new URL(req.url).searchParams;
  const channelId = params.get("channelId");
  return { messages: await listMessagesForAdmin(params.get("q") ?? "", channelId && isValidObjectId(channelId) ? channelId : null) };
});

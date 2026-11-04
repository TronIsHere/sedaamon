import { isValidObjectId } from "mongoose";
import { listChannelsForAdmin } from "@/server/admin";
import { handle, requireAdmin } from "@/server/http";

export const GET = handle(async (req) => {
  await requireAdmin();
  const params = new URL(req.url).searchParams;
  const serverId = params.get("serverId");
  return { channels: await listChannelsForAdmin(params.get("q") ?? "", serverId && isValidObjectId(serverId) ? serverId : null) };
});

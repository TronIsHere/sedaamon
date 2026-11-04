import { handle, requireMessageScope, requireUser } from "@/server/http";
import { discardUpload } from "@/server/files";

/** Takes a file back out of the composer before it is sent. Sent files go with their message instead. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/channels/[id]/files/[fileId]">) => {
  const user = await requireUser();
  const { id, fileId } = await ctx.params;
  await requireMessageScope(id, user._id);
  await discardUpload(user._id, id, fileId);
  return { ok: true };
});

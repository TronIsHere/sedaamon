import { z } from "zod";
import { handle, requireAdmin } from "@/server/http";
import { reviewTopUp } from "@/server/store";

/** Confirms a transfer (the points go to the buyer's wallet) or turns it down with a reason. */
export const POST = handle(async (req, ctx: RouteContext<"/api/admin/topups/[id]">) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action, note } = z.object({ action: z.enum(["approve", "reject"]), note: z.string().max(300).default("") }).parse(await req.json());
  return { topUp: await reviewTopUp(admin._id, id, action, note) };
});

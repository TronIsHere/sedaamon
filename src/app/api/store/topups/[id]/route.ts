import { z } from "zod";
import { handle, requireUser } from "@/server/http";
import { cancelTopUp, submitTopUp } from "@/server/store";

/** "I paid": the last four digits of the card the money came from, and the bank's reference number if there is one. */
export const PATCH = handle(async (req, ctx: RouteContext<"/api/store/topups/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = z.object({ cardLast4: z.string().max(20), reference: z.string().max(60).default("") }).parse(await req.json());
  return { topUp: await submitTopUp(user._id, id, body) };
});

/** Drops an order that hasn't been paid. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/store/topups/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return { topUp: await cancelTopUp(user._id, id) };
});

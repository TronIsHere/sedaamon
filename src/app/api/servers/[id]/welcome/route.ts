import { z } from "zod";
import { handle, requireMember, requireUser } from "@/server/http";
import { acceptWelcome } from "@/server/servers";

/** A newcomer finishes the welcome screen, accepting the rules if the server has any. */
export const POST = handle(async (req, ctx: RouteContext<"/api/servers/[id]/welcome">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireMember(id, user._id);
  const { acceptRules } = z.object({ acceptRules: z.boolean().default(false) }).parse(await req.json());
  await acceptWelcome(id, user._id, acceptRules);
  return { onboarding: { welcomePending: false, rulesPending: false } };
});

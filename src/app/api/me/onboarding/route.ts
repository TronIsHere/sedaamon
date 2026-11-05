import { z } from "zod";
import { INTEREST_IDS, USE_CASE_IDS } from "@/lib/onboarding";
import { handle, requireUser } from "@/server/http";
import { User } from "@/server/models";

/** Saves the answers as the newcomer moves through onboarding; `done` ends it, whether they finished or skipped. */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = z
    .object({
      useCase: z.enum(USE_CASE_IDS).optional(),
      interests: z.array(z.string()).max(20).optional(),
      done: z.boolean().optional(),
    })
    .parse(await req.json());
  const update: { useCase?: string; interests?: string[]; onboardingPending?: boolean } = {};
  if (body.useCase) update.useCase = body.useCase;
  if (body.interests) update.interests = [...new Set(body.interests.filter((i) => INTEREST_IDS.includes(i)))];
  if (body.done) update.onboardingPending = false;
  await User.updateOne({ _id: user._id }, update);
  return { ok: true };
});

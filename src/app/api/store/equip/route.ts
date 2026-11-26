import { z } from "zod";
import { handle, requireUser } from "@/server/http";
import { equipItem } from "@/server/store";

/** Wears an owned frame or background, or takes it off with `itemId: null`. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const { slot, itemId } = z.object({ slot: z.enum(["frame", "background"]), itemId: z.string().max(60).nullable() }).parse(await req.json());
  return { user: await equipItem(user._id, slot, itemId) };
});

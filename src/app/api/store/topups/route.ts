import { z } from "zod";
import { handle, requireUser } from "@/server/http";
import { createTopUp } from "@/server/store";

/** Opens a card-to-card order for a points package and returns the exact sum to transfer. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const { packageId } = z.object({ packageId: z.string().max(20) }).parse(await req.json());
  return { topUp: await createTopUp(user._id, packageId) };
});

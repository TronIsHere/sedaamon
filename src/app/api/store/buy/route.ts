import { z } from "zod";
import { handle, requireUser } from "@/server/http";
import { buyItem } from "@/server/store";

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { itemId } = z.object({ itemId: z.string().max(60) }).parse(await req.json());
  return await buyItem(user._id, itemId);
});

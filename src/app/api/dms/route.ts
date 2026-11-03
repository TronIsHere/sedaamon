import { z } from "zod";
import { listDms, openDm } from "@/server/dms";
import { handle, requireUser } from "@/server/http";

export const GET = handle(async () => listDms((await requireUser())._id));

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { userId } = z.object({ userId: z.string() }).parse(await req.json());
  return { dm: await openDm(user._id, userId) };
});

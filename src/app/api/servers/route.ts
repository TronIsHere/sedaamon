import { z } from "zod";
import { handle, HttpError, requireUser } from "@/server/http";
import { createServer, listServers } from "@/server/servers";

export const GET = handle(async () => {
  const user = await requireUser();
  return { servers: await listServers(user._id) };
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { name, template } = z.object({ name: z.string(), template: z.string().max(40).optional() }).parse(await req.json());
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40) throw new HttpError(400, "نام سرور باید بین ۲ تا ۴۰ حرف باشد");
  return { server: await createServer(clean, user._id, template) };
});

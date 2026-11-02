import { z } from "zod";
import { handle, requireUser } from "@/server/http";
import { joinServer } from "@/server/servers";

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { code } = z.object({ code: z.string() }).parse(await req.json());
  // Accept a full invite link as well as the bare code.
  const bare = code.trim().split("/").filter(Boolean).pop() ?? "";
  return { server: await joinServer(bare, user) };
});

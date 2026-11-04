import { listUsers } from "@/server/admin";
import { handle, requireAdmin } from "@/server/http";

export const GET = handle(async (req) => {
  await requireAdmin();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return { users: await listUsers(q) };
});

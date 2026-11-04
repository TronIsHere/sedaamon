import { adminStats } from "@/server/admin";
import { handle, requireAdmin } from "@/server/http";

export const GET = handle(async () => {
  await requireAdmin();
  return adminStats();
});

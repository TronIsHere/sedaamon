import { handle, requireAdmin } from "@/server/http";
import { listTopUps } from "@/server/store";

const STATUSES = new Set(["submitted", "open", "pending", "approved", "rejected", "expired", "cancelled", "all"]);

export const GET = handle(async (req) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get("status") ?? "submitted";
  return { topUps: await listTopUps(STATUSES.has(status) ? status : "submitted") };
});

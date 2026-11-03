import { listForwardTargets } from "@/server/forward";
import { handle, requireUser } from "@/server/http";

export const GET = handle(async () => {
  const user = await requireUser();
  return listForwardTargets(user._id);
});

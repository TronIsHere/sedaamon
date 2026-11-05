import { handle, requireUser } from "@/server/http";
import { listReadStates } from "@/server/reads";

/** How far you've read every channel and conversation, and how many messages wait in each. */
export const GET = handle(async () => {
  const user = await requireUser();
  return { reads: await listReadStates(user._id) };
});

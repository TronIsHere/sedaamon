import { handle, requireUser } from "@/server/http";
import { walletOf } from "@/server/store";

/** The person's points, what they own and wear, their recent top-ups, and where to send a transfer. */
export const GET = handle(async () => {
  const user = await requireUser();
  return { wallet: await walletOf(user._id) };
});

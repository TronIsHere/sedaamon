import { z } from "zod";
import { handle, requireAdmin } from "@/server/http";
import { startImport } from "@/server/movieImport";

/** Has the server download a film from a link into the library. Site admin only; progress shows in GET /api/movies. */
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const { url, name } = z.object({ url: z.string().max(4000), name: z.string().max(200).nullish() }).parse(await req.json());
  return { import: await startImport(url, name ?? null, user._id) };
});

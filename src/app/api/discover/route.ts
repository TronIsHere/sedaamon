import { z } from "zod";
import { handle, requireUser } from "@/server/http";
import { listDiscover } from "@/server/servers";

/** The public server directory: `?q=` text or #tag, `?category=`, `?sort=members|new`, `?page=` (from 0). */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const params = z
    .object({
      q: z.string().max(100).default(""),
      category: z.string().max(20).default(""),
      sort: z.enum(["members", "new"]).default("members"),
      page: z.coerce.number().int().min(0).max(1000).default(0),
    })
    .parse(Object.fromEntries(new URL(req.url).searchParams));
  return listDiscover(user._id, params);
});

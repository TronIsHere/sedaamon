import { z } from "zod";
import { cleanCategoryName, MAX_CATEGORIES } from "@/server/categories";
import { assertPermission, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Category } from "@/server/models";
import { emitToServer } from "@/server/realtime";
import { toCategory } from "@/server/serialize";

/** A new category goes below the others. */
export const POST = handle(async (req, ctx: RouteContext<"/api/servers/[id]/categories">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  assertPermission(member, "channel:manage", "اجازهٔ ساختن دسته را ندارید");

  const { name } = z.object({ name: z.string() }).parse(await req.json());
  if ((await Category.countDocuments({ server: id })) >= MAX_CATEGORIES) throw new HttpError(400, `هر سرور حداکثر ${MAX_CATEGORIES} دسته می‌تواند داشته باشد`);
  const last = await Category.findOne({ server: id }).sort({ position: -1 }).lean();
  const category = toCategory(await Category.create({ server: id, name: cleanCategoryName(name), position: (last?.position ?? 0) + 1 }));
  emitToServer(id, "category:new", category);
  return { category };
});

import { z } from "zod";
import { cleanCategoryName } from "@/server/categories";
import { assertId, assertPermission, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Category, Channel } from "@/server/models";
import { emitToServer } from "@/server/realtime";
import { toCategory } from "@/server/serialize";

type Ctx = RouteContext<"/api/servers/[id]/categories/[categoryId]">;

async function loadForManager(ctx: Ctx, userId: Parameters<typeof requireMember>[1]) {
  const { id, categoryId } = await ctx.params;
  const member = await requireMember(id, userId);
  assertPermission(member, "channel:manage", "اجازهٔ تغییر دسته‌ها را ندارید");
  const category = await Category.findOne({ _id: assertId(categoryId), server: id }).lean();
  if (!category) throw new HttpError(404, "دسته پیدا نشد");
  return { serverId: id, category };
}

/** Rename a category, or move it one step up or down the sidebar. */
export const PATCH = handle(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { serverId, category } = await loadForManager(ctx, user._id);
  const body = z.object({ name: z.string().optional(), move: z.enum(["up", "down"]).optional() }).parse(await req.json());

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = cleanCategoryName(body.name);
  if (body.move) {
    const up = body.move === "up";
    const neighbour = await Category.findOne({ server: serverId, position: up ? { $lt: category.position } : { $gt: category.position } })
      .sort({ position: up ? -1 : 1 })
      .lean();
    if (neighbour) {
      const moved = await Category.findByIdAndUpdate(neighbour._id, { position: category.position }, { new: true }).lean();
      emitToServer(serverId, "category:update", toCategory(moved!));
      update.position = neighbour.position;
    }
  }

  const saved = await Category.findByIdAndUpdate(category._id, update, { new: true }).lean();
  const dto = toCategory(saved!);
  emitToServer(serverId, "category:update", dto);
  return { category: dto };
});

/** The channels inside are kept and move up, above every category. */
export const DELETE = handle(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { serverId, category } = await loadForManager(ctx, user._id);
  await Promise.all([Category.deleteOne({ _id: category._id }), Channel.updateMany({ category: category._id }, { category: null })]);
  emitToServer(serverId, "category:delete", { serverId, categoryId: String(category._id) });
  return { ok: true };
});

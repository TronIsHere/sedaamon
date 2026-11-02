import { z } from "zod";
import { assertId, handle, HttpError, requireChannelAccess, requireUser } from "@/server/http";
import { Message, User } from "@/server/models";
import { emitToServer } from "@/server/realtime";
import { toMessage } from "@/server/serialize";

const PAGE_SIZE = 50;

export const GET = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireChannelAccess(id, user._id);

  const before = new URL(req.url).searchParams.get("before");
  const filter = before ? { channel: id, _id: { $lt: assertId(before) } } : { channel: id };
  const docs = await Message.find(filter).sort({ _id: -1 }).limit(PAGE_SIZE).lean();
  const authors = await User.find({ _id: { $in: [...new Set(docs.map((m) => String(m.author)))] } }).lean();
  const byId = new Map(authors.map((a) => [String(a._id), a]));

  const messages = docs.reverse().flatMap((m) => {
    const author = byId.get(String(m.author));
    return author ? [toMessage(m, author)] : [];
  });
  return { messages, hasMore: docs.length === PAGE_SIZE };
});

export const POST = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { channel } = await requireChannelAccess(id, user._id);
  if (channel.type !== "text") throw new HttpError(400, "این کانال متنی نیست");

  const { content } = z.object({ content: z.string() }).parse(await req.json());
  const text = content.trim();
  if (!text) throw new HttpError(400, "پیام خالی است");
  if (text.length > 2000) throw new HttpError(400, "پیام نباید بیشتر از ۲۰۰۰ حرف باشد");

  const message = toMessage(await Message.create({ channel: id, author: user._id, content: text }), user);
  emitToServer(String(channel.server), "message:new", { ...message, serverId: String(channel.server) });
  return { message };
});

import { z } from "zod";
import { assertId, assertCanWrite, handle, HttpError, requireMessageScope, requireUser } from "@/server/http";
import { serializeMessage, serializeMessages } from "@/server/messages";
import { Message } from "@/server/models";

const PAGE_SIZE = 50;

export const GET = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireMessageScope(id, user._id);

  const before = new URL(req.url).searchParams.get("before");
  const filter = before ? { channel: id, _id: { $lt: assertId(before) } } : { channel: id };
  const docs = await Message.find(filter).sort({ _id: -1 }).limit(PAGE_SIZE).lean();
  return { messages: await serializeMessages(docs.reverse()), hasMore: docs.length === PAGE_SIZE };
});

export const POST = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const scope = await requireMessageScope(id, user._id);
  if (scope.type === "voice") throw new HttpError(400, "این کانال متنی نیست");
  assertCanWrite(scope.member);

  const { content, replyTo } = z.object({ content: z.string(), replyTo: z.string().optional() }).parse(await req.json());
  const text = content.trim();
  if (!text) throw new HttpError(400, "پیام خالی است");
  if (text.length > 2000) throw new HttpError(400, "پیام نباید بیشتر از ۲۰۰۰ حرف باشد");

  // A reply has to point at a message in this same channel.
  if (replyTo && !(await Message.exists({ _id: assertId(replyTo), channel: id }))) {
    throw new HttpError(400, "پیامی که می‌خواهید به آن پاسخ دهید پیدا نشد");
  }

  const doc = await Message.create({ channel: id, author: user._id, content: text, replyTo: replyTo ?? null });
  const message = await serializeMessage(doc.toObject());
  await scope.touch();
  scope.emit("message:new", { ...message, serverId: scope.serverId });
  return { message };
});

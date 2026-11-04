import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { MAX_ATTACHMENTS } from "@/lib/attachments";
import { findSticker } from "@/lib/stickers";
import { assertId, assertCanWrite, handle, HttpError, requireMessageScope, requireUser } from "@/server/http";
import { claimUploads } from "@/server/files";
import { serializeMessage, serializeMessages } from "@/server/messages";
import { Message } from "@/server/models";
import { notifyPings, resolveMentions } from "@/server/notifications";

const PAGE_SIZE = 50;

/**
 * One page of a channel's history, oldest first. Without a cursor it is the newest page; `before` / `after` give the
 * page just older / newer than that message, and `around` a page centred on it (for jumping to a reply or a pin).
 * `hasMore` says older messages exist beyond the page, `hasNewer` that newer ones do.
 */
export const GET = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireMessageScope(id, user._id);

  const params = new URL(req.url).searchParams;
  const before = params.get("before");
  const after = params.get("after");
  const around = params.get("around");

  // Each query asks for one extra message, which only tells whether there is more beyond the page.
  const older = async (cursor: string | null, size: number, inclusive = false) => {
    const filter = cursor ? { channel: id, _id: { [inclusive ? "$lte" : "$lt"]: assertId(cursor) } } : { channel: id };
    const docs = await Message.find(filter).sort({ _id: -1 }).limit(size + 1).lean();
    return { docs: docs.slice(0, size).reverse(), more: docs.length > size };
  };
  const newer = async (cursor: string, size: number) => {
    const docs = await Message.find({ channel: id, _id: { $gt: assertId(cursor) } }).sort({ _id: 1 }).limit(size + 1).lean();
    return { docs: docs.slice(0, size), more: docs.length > size };
  };

  if (around) {
    const half = PAGE_SIZE / 2;
    const [back, forward] = await Promise.all([older(around, half, true), newer(around, half)]);
    if (!back.docs.some((d) => String(d._id) === around)) throw new HttpError(404, "پیام پیدا نشد");
    return {
      messages: await serializeMessages([...back.docs, ...forward.docs]),
      hasMore: back.more,
      hasNewer: forward.more,
    };
  }
  if (after) {
    const page = await newer(after, PAGE_SIZE);
    return { messages: await serializeMessages(page.docs), hasMore: true, hasNewer: page.more };
  }
  const page = await older(before, PAGE_SIZE);
  // Paging back through history says nothing new about the newer side; only the very newest page is known to end there.
  return { messages: await serializeMessages(page.docs), hasMore: page.more, ...(before ? {} : { hasNewer: false }) };
});

export const POST = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const scope = await requireMessageScope(id, user._id);
  if (scope.type === "voice") throw new HttpError(400, "این کانال متنی نیست");
  assertCanWrite(scope.member);

  const { content = "", sticker: stickerId, replyTo, mentions: mentionIds = [], attachments: fileIds = [] } = z
    .object({
      content: z.string().optional(),
      sticker: z.string().optional(),
      replyTo: z.string().optional(),
      mentions: z.array(z.string()).max(50).optional(),
      attachments: z.array(z.string()).max(MAX_ATTACHMENTS).optional(),
    })
    .parse(await req.json());
  // A sticker message carries the sticker's own text, so it reads naturally in previews, replies and search.
  const sticker = stickerId ? findSticker(stickerId)?.sticker : null;
  if (stickerId && !sticker) throw new HttpError(400, "این استیکر پیدا نشد");
  const text = sticker ? sticker.text : content.trim();
  if (!text && !fileIds.length) throw new HttpError(400, "پیام خالی است");
  if (text.length > 2000) throw new HttpError(400, "پیام نباید بیشتر از ۲۰۰۰ حرف باشد");

  // A reply has to point at a message in this same channel.
  const target = replyTo ? await Message.findOne({ _id: assertId(replyTo), channel: id }, { author: 1 }).lean() : null;
  if (replyTo && !target) throw new HttpError(400, "پیامی که می‌خواهید به آن پاسخ دهید پیدا نشد");

  // Claimed last, once nothing else can turn the message down, so a refused message leaves its files pending.
  const attachments = sticker ? [] : await claimUploads(user._id, id, fileIds);
  const { mentions, everyone } = await resolveMentions(scope, user._id, text, sticker ? [] : mentionIds.filter(isValidObjectId));
  const doc = await Message.create({
    channel: id,
    author: user._id,
    content: text,
    sticker: sticker?.id ?? null,
    replyTo: replyTo ?? null,
    mentions,
    mentionEveryone: everyone,
    attachments,
  });
  const message = await serializeMessage(doc.toObject());
  await scope.touch();
  scope.emit("message:new", { ...message, serverId: scope.serverId });
  await notifyPings(scope, doc.toObject(), { mentions, everyone, replyAuthor: target?.author ?? null }).catch((err) =>
    console.error("[notifications]", err),
  );
  return { message };
});

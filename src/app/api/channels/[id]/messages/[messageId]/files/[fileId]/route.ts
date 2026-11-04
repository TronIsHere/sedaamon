import { assertId, handle, HttpError, requireMessageScope, requireUser } from "@/server/http";
import { Message } from "@/server/models";
import { getStorage } from "@/server/storage";

/**
 * A file sent with a message, for those who can read the message. Files never change, so the URL can be cached for good.
 * Only sniffed pictures and voice notes are shown inline; everything else is a download the browser is told not to render.
 * Byte ranges are answered because Safari won't play audio without them.
 */
export const GET = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages/[messageId]/files/[fileId]">) => {
  const user = await requireUser();
  const { id, messageId, fileId } = await ctx.params;
  await requireMessageScope(id, user._id);
  const message = await Message.findOne({ _id: assertId(messageId), channel: id }, { attachments: 1 }).lean();
  const file = message?.attachments.find((f) => f.id === fileId);
  if (!file) throw new HttpError(404, "فایل پیدا نشد");

  const bytes = await getStorage().get(file.key);
  if (!bytes) throw new HttpError(404, "فایل پیدا نشد");
  const inline = file.kind === "image" || file.kind === "voice";
  const encoded = encodeURIComponent(file.name);
  const headers: Record<string, string> = {
    "Content-Type": inline ? file.contentType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = bytes.length;
    // "bytes=-N" asks for the last N bytes.
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
});

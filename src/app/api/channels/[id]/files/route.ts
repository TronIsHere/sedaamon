import { MAX_FILE_BYTES } from "@/lib/attachments";
import { assertCanWrite, handle, HttpError, requireMessageScope, requireUser } from "@/server/http";
import { saveUpload } from "@/server/files";

/** Room for the form's own fields around the file. */
const FORM_SLACK = 16 * 1024;

/** One file picked in the composer, as multipart form data (`file`, and for pictures `width`, `height`, `preview`). */
export const POST = handle(async (req, ctx: RouteContext<"/api/channels/[id]/files">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const scope = await requireMessageScope(id, user._id);
  if (scope.type === "voice") throw new HttpError(400, "این کانال متنی نیست");
  assertCanWrite(scope.member);

  // Turned away before the body is read, when the browser says up front that it is too big.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + FORM_SLACK) {
    throw new HttpError(413, "حجم فایل نباید بیشتر از ۵ مگابایت باشد");
  }
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "فایل درست فرستاده نشد");
  });
  return saveUpload(user._id, id, form);
});

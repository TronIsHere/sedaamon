import { handle, HttpError, requireUser } from "@/server/http";
import { canManageLibrary, receiveMovie } from "@/server/cinema";

/** Adds a film to the app-wide library. Site admin only. The body is the file itself; see receiveMovie for the headers. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  if (!canManageLibrary(user)) throw new HttpError(403, "فقط مدیر صدامون می‌تواند فیلم اضافه کند");
  return receiveMovie(req, user._id);
});

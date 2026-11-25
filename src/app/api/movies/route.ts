import { handle, requireAdmin } from "@/server/http";
import { adminLibrary, receiveMovie } from "@/server/cinema";
import { ffmpegAvailable } from "@/server/ffmpeg";
import { listImports } from "@/server/movieImport";
import { listRepackages } from "@/server/movieRepackage";
import type { AdminMoviesDTO } from "@/lib/types";

/** The film library for the admin panel (`?q=` narrows it by name), with the downloads still running. */
export const GET = handle(async (req): Promise<AdminMoviesDTO> => {
  await requireAdmin();
  return { ...(await adminLibrary(new URL(req.url).searchParams.get("q") ?? "")), imports: listImports(), repackages: listRepackages(), canRepackage: await ffmpegAvailable() };
});

/** Adds a film to the app-wide library. Site admin only. The body is the file itself; see receiveMovie for the headers. */
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  return receiveMovie(req, user._id);
});

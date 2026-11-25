import { execFile, spawn } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

/*
 * Repackages a film for Safari with ffmpeg: the picture is copied bit for bit into an MP4 (HEVC under the `hvc1`
 * tag, the only one Apple plays) and sound that isn't stereo AAC becomes it. Nothing is re-encoded but the sound,
 * so it takes about as long as reading the file. Devices that can't decode the picture itself still can't.
 */

const run = promisify(execFile);
const ffmpegBin = () => process.env.FFMPEG_PATH || "ffmpeg";
const ffprobeBin = () => process.env.FFPROBE_PATH || "ffprobe";

/** No progress for this long and ffmpeg is taken to be stuck. */
const STUCK_MS = 5 * 60_000;

export interface ProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
  channels?: number;
  disposition?: { default?: number; attached_pic?: number };
}
export interface Probe {
  streams: ProbeStream[];
  format: { format_name?: string; duration?: string };
}

export type Plan =
  /** Already what Safari plays. */
  | { kind: "fine" }
  /** A codec that moving to MP4 does nothing for. */
  | { kind: "unsupported"; codec: string }
  | { kind: "repackage"; video: number; hevc: boolean; audio: { index: number; copy: boolean }[] };

let availability: { ok: boolean; at: number } | null = null;

/** Whether ffmpeg is installed. A no is asked again after a while, so installing it needs no restart. */
export async function ffmpegAvailable() {
  if (availability && (availability.ok || Date.now() - availability.at < 30_000)) return availability.ok;
  const ok = await Promise.all([run(ffmpegBin(), ["-version"]), run(ffprobeBin(), ["-version"])]).then(
    () => true,
    () => false,
  );
  availability = { ok, at: Date.now() };
  return ok;
}

/** The demuxer is named and only local files may be opened, so a crafted film can't make ffmpeg fetch anything. */
const input = (file: string, contentType: string) => ["-protocol_whitelist", "file", "-f", contentType === "video/mp4" ? "mov" : "matroska", "-i", `file:${file}`];

export async function probeFilm(file: string, contentType: string): Promise<Probe> {
  const args = ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", ...input(file, contentType)];
  const { stdout } = await run(ffprobeBin(), args, { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
  const probe = JSON.parse(stdout) as Partial<Probe>;
  return { streams: probe.streams ?? [], format: probe.format ?? {} };
}

const isDefault = (s: ProbeStream) => (s.disposition?.default ? 0 : 1);

export function planRepackage(probe: Probe): Plan {
  const video = probe.streams.filter((s) => s.codec_type === "video" && !s.disposition?.attached_pic).sort((a, b) => isDefault(a) - isDefault(b))[0];
  if (!video) return { kind: "unsupported", codec: "?" };
  const codec = video.codec_name ?? "?";
  if (codec !== "h264" && codec !== "hevc") return { kind: "unsupported", codec };

  // Every language is kept, the one the film starts with first: that is the one browsers play.
  const audio = probe.streams
    .filter((s) => s.codec_type === "audio")
    .sort((a, b) => isDefault(a) - isDefault(b))
    .map((s) => ({ index: s.index, copy: s.codec_name === "aac" && (s.channels ?? 2) <= 2 }));
  const isMp4 = !!probe.format.format_name?.split(",").includes("mp4");
  const tagOk = codec === "h264" || video.codec_tag_string === "hvc1";
  if (isMp4 && tagOk && audio.every((a) => a.copy)) return { kind: "fine" };
  return { kind: "repackage", video: video.index, hevc: codec === "hevc", audio };
}

export function repackageArgs(source: string, contentType: string, target: string, plan: Extract<Plan, { kind: "repackage" }>) {
  return [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1", "-y",
    ...input(source, contentType),
    "-map", `0:${plan.video}`,
    ...plan.audio.flatMap((a) => ["-map", `0:${a.index}`]),
    "-c:v", "copy",
    ...(plan.hevc ? ["-tag:v", "hvc1"] : []),
    ...plan.audio.flatMap((a, i) => (a.copy ? [`-c:a:${i}`, "copy"] : [`-c:a:${i}`, "aac", `-ac:a:${i}`, "2", `-b:a:${i}`, "192k"])),
    ...plan.audio.map((_, i) => [`-disposition:a:${i}`, i === 0 ? "default" : "0"]).flat(),
    // Subtitles live beside the film as WebVTT; Safari would show tracks inside it a second time.
    "-sn", "-dn", "-map_chapters", "-1",
    // The index goes to the front, so playback starts without fetching the end of the file first.
    "-movflags", "+faststart", "-max_muxing_queue_size", "4096",
    "-f", "mp4", `file:${target}`,
  ];
}

/** Runs ffmpeg at low priority, reporting seconds done. Rejects with the last of what it complained about. */
export function runFfmpeg(args: string[], signal: AbortSignal, onSeconds: (seconds: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBin(), args, { signal, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"] });
    try {
      // Calls and chat on the same machine come first.
      if (child.pid) os.setPriority(child.pid, 10);
    } catch {}
    let errors = "";
    let pending = "";
    let last = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - last > STUCK_MS) child.kill("SIGKILL");
    }, 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      last = Date.now();
      const lines = (pending + chunk).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^out_time_us=(\d+)/.exec(line);
        if (m) onSeconds(Number(m[1]) / 1e6);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errors = (errors + chunk).slice(-2000);
    });
    child.once("error", (err) => {
      clearInterval(watchdog);
      reject(err);
    });
    child.once("close", (code) => {
      clearInterval(watchdog);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${errors.trim()}`));
    });
  });
}

/** What is wrong with a repackaged film, or null. Checked before the original is given up. */
export function repackageProblem(result: Probe, plan: Extract<Plan, { kind: "repackage" }>, duration: number): string | null {
  const check = planRepackage(result);
  if (check.kind !== "fine") return `result is ${check.kind}`;
  const audio = result.streams.filter((s) => s.codec_type === "audio").length;
  if (audio !== plan.audio.length) return `${audio} audio tracks instead of ${plan.audio.length}`;
  const length = Number(result.format.duration);
  // A source cut short still comes out as a valid, shorter film.
  if (!Number.isFinite(length) || Math.abs(length - duration) > Math.max(3, duration * 0.01)) return `${length}s instead of ${duration}s`;
  return null;
}

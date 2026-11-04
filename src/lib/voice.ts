import {
  createLocalAudioTrack,
  isBrowserSupported,
  Track,
  type AudioCaptureOptions,
  type LocalAudioTrack,
} from "livekit-client";

// Browser quirks around calls, mostly Safari and phones.

/** Why this browser can't join a call at all, or null when it can. */
export function voiceUnsupportedReason() {
  if (!isBrowserSupported() || typeof RTCPeerConnection === "undefined") {
    // In-app browsers (Telegram, Instagram…) often ship without WebRTC.
    return "این مرورگر از تماس صوتی پشتیبانی نمی‌کند. صدامون را در Safari یا Chrome باز کنید";
  }
  return null;
}

/** Browsers only expose the microphone on HTTPS (and localhost). */
export const canUseMic = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

export function micErrorMessage(err: unknown) {
  if (!canUseMic()) return "میکروفون فقط روی اتصال امن (HTTPS) در دسترس است. فقط می‌توانید بشنوید";
  const name = (err as Error | undefined)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "دسترسی به میکروفون داده نشد. از تنظیمات مرورگر اجازه دهید";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "میکروفونی پیدا نشد";
  if (name === "NotReadableError" || name === "AbortError") return "میکروفون در اختیار برنامهٔ دیگری است";
  return "دسترسی به میکروفون ممکن نشد";
}

/**
 * Starts capturing the microphone right away, so the permission prompt belongs to the tap that asked for it
 * and iOS switches its audio session before any remote audio starts playing. Never rejects.
 */
export function acquireMic(options?: AudioCaptureOptions): Promise<LocalAudioTrack | Error> {
  if (!canUseMic()) return Promise.resolve(new Error("insecure context"));
  return createLocalAudioTrack(options).catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))));
}

/**
 * Only Chromium can capture tab or system audio with a screen share (`userAgentData` exists only there).
 * Elsewhere, asking for audio can fail the whole request, and getDisplayMedia can't be retried outside
 * the original click, so don't ask.
 */
export const canShareScreenAudio = () => typeof navigator !== "undefined" && "userAgentData" in navigator;

/**
 * Names someone's camera or screen independent of the track id, so a choice about it (pinning, letting it through
 * in low-data mode) survives them restarting the share. A screen's sound goes with its picture.
 */
export const videoKey = (identity: string, source: Track.Source) =>
  `${identity}:${source === Track.Source.ScreenShareAudio ? Track.Source.ScreenShare : source}`;

const LOW_DATA_KEY = "sedaamon:low-data";

/** Low-data mode is remembered per device, since it's about this phone's connection, not the account. */
export function readLowDataPref() {
  try {
    return localStorage.getItem(LOW_DATA_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeLowDataPref(on: boolean) {
  try {
    localStorage.setItem(LOW_DATA_KEY, on ? "on" : "off");
  } catch {}
}

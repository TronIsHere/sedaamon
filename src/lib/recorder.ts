/** Voice notes: recorded while a button is held, sent on release. */

/** Long enough for anything said in one breath and then some; at 16 kbps this is under a megabyte. */
export const VOICE_NOTE_MAX_MS = 5 * 60_000;
/** Shorter than this is a tap, not a recording. */
export const VOICE_NOTE_MIN_MS = 600;
/** Opus speech stays clear well below this; it is what keeps a note small on a weak connection. */
const BITRATE = 16_000;
const BARS = 48;
const LEVEL_EVERY_MS = 50;

export interface VoiceNote {
  blob: Blob;
  /** A name with the right extension for the recorded container. */
  name: string;
  seconds: number;
  /** Loudness bars from 0 to 31, drawn before the note is downloaded. */
  waveform: number[];
}

export interface Recording {
  startedAt: number;
  stop: () => Promise<VoiceNote>;
  cancel: () => void;
}

export function canRecordVoice() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Opus where the browser can record it (Chrome, Firefox, newer Safari); otherwise whatever the browser offers. */
function pickType() {
  for (const type of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

const extensionOf = (type: string) => (type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm");

/** Squeezes the sampled peaks into a fixed number of bars, scaled so the loudest one is full height. */
function toBars(levels: number[]) {
  if (!levels.length) return [];
  const bars = Array.from({ length: BARS }, (_, i) => {
    const from = Math.floor((i * levels.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / BARS));
    return Math.max(...levels.slice(from, to));
  });
  const loudest = Math.max(...bars) || 1;
  // The square root lifts quiet speech so the shape still reads.
  return bars.map((v) => Math.round(Math.sqrt(v / loudest) * 31));
}

/** Asks for the microphone and starts recording. Rejects when the microphone is refused or missing. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const type = pickType();
  const recorder = new MediaRecorder(stream, { ...(type && { mimeType: type }), audioBitsPerSecond: BITRATE });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  // Loudness is sampled while recording, so the waveform needs no decoding afterwards.
  const audio = new AudioContext();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  audio.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const levels: number[] = [];
  const sampler = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let peak = 0;
    for (const v of samples) peak = Math.max(peak, Math.abs(v));
    levels.push(peak);
  }, LEVEL_EVERY_MS);

  const release = () => {
    window.clearInterval(sampler);
    for (const track of stream.getTracks()) track.stop();
    void audio.close();
  };

  recorder.start(1000);
  const startedAt = Date.now();
  return {
    startedAt,
    stop: () =>
      new Promise<VoiceNote>((resolve, reject) => {
        const seconds = (Date.now() - startedAt) / 1000;
        recorder.onstop = () => {
          release();
          const blobType = recorder.mimeType || type || "audio/webm";
          resolve({ blob: new Blob(chunks, { type: blobType }), name: `voice.${extensionOf(blobType)}`, seconds, waveform: toBars(levels) });
        };
        recorder.onerror = () => {
          release();
          reject(new Error("ضبط صدا ممکن نشد"));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      if (recorder.state === "inactive") release();
      else recorder.stop();
    },
  };
}

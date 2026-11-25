import type { FileHandle } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { vint } from "./videoMeta";

/*
 * Pulls the subtitle tracks out of a film ("softsub") and turns them into WebVTT, the only kind browsers show.
 * Chrome and Firefox ignore subtitles that sit inside an MKV or MP4, so without this they would never appear.
 * Like videoMeta.ts this reads the container itself, so no ffmpeg is needed. Text subtitles only (SRT, ASS/SSA,
 * WebVTT, MP4 timed text): picture subtitles (PGS, VobSub) have no text to read and are left out.
 */

/** Raised whenever this file learns to read more, so films already in the library are read again. */
export const SUBTITLES_VERSION = 1;

const MAX_TRACKS = 40;
const MAX_CUES = 20_000;
/** A line of dialogue is a few hundred bytes; anything huge in a subtitle track is not text. */
const MAX_CUE_BYTES = 256 * 1024;
const MAX_MOOV = 128 * 1024 * 1024;
/** How long a line stays up when the file doesn't say, in seconds. */
const DEFAULT_SHOW = 5;

/** Random access to a film, wherever it is kept. */
export interface ByteSource {
  size: number;
  /** Up to `length` bytes from `position`; fewer at the end of the file. */
  read(position: number, length: number): Promise<Buffer>;
}

export const fileSource = (file: FileHandle, size: number): ByteSource => ({
  size,
  async read(position, length) {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await file.read(buf, 0, length, position);
    return buf.subarray(0, bytesRead);
  },
});

export interface Cue {
  /** Seconds. */
  start: number;
  end: number;
  text: string;
}

export interface SubtitleTrack {
  /** BCP 47, or "und" when nobody can tell. */
  lang: string;
  /** The name the file gives the track, if any. */
  title: string;
  /** Only the lines in another language, or signs; not the whole dialogue. */
  forced: boolean;
  cues: Cue[];
}

type Format = "text" | "ass" | "webvtt" | "webvtt-block" | "tx3g" | "wvtt";
type RawCue = { start: number; end: number | null; data: Buffer };

/** The text subtitle tracks in a film, empty ones left out. Never throws for a malformed film. */
export async function extractSubtitles(source: ByteSource, contentType: string): Promise<SubtitleTrack[]> {
  return contentType === "video/mp4" ? mp4Subtitles(source) : matroskaSubtitles(source);
}

/* ---------- Matroska / WebM ---------- */

const ID = {
  segment: 0x18538067,
  info: 0x1549a966,
  timescale: 0x2ad7b1,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  codecId: 0x86,
  language: 0x22b59c,
  languageBcp47: 0x22b59d,
  name: 0x536e,
  forced: 0x55aa,
  defaultDuration: 0x23e383,
  encodings: 0x6d80,
  encoding: 0x6240,
  compression: 0x5034,
  compAlgo: 0x4254,
  compSettings: 0x4255,
  encryption: 0x5035,
  cluster: 0x1f43b675,
  clusterTime: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  blockDuration: 0x9b,
} as const;

const SUBTITLE_TRACK = 0x11;
/** Read ahead by this much: the headers of neighbouring blocks come out of one read. */
const WINDOW = 2 * 1024 * 1024;

/** Reads small pieces out of a large sliding window, so walking a film doesn't cost one read per block. */
class Reader {
  private buf: Buffer = Buffer.alloc(0);
  private at = 0;
  constructor(private source: ByteSource) {}

  async bytes(position: number, length: number): Promise<Buffer> {
    if (position < this.at || position + length > this.at + this.buf.length) {
      this.buf = await this.source.read(position, Math.max(0, Math.min(Math.max(WINDOW, length), this.source.size - position)));
      this.at = position;
    }
    return this.buf.subarray(position - this.at, position - this.at + length);
  }

  /** The element at `position`: its id, where its body starts, and the body's size (null when unknown). */
  async element(position: number) {
    const head = await this.bytes(position, Math.min(12, this.source.size - position));
    const id = vint(head, 0, true);
    const size = id && vint(head, id.length, false);
    if (!id || !size) return null;
    return { id: id.value, body: position + id.length + size.length, size: size.unknown ? null : size.value };
  }
}

/** The elements directly inside a body that is already in memory. */
function* children(buf: Buffer): Generator<{ id: number; data: Buffer }> {
  for (let p = 0; p < buf.length; ) {
    const id = vint(buf, p, true);
    const size = id && vint(buf, p + id.length, false);
    if (!id || !size || size.unknown) return;
    const body = p + id.length + size.length;
    if (body + size.value > buf.length) return;
    yield { id: id.value, data: buf.subarray(body, body + size.value) };
    p = body + size.value;
  }
}

const uint = (b: Buffer) => (b.length === 0 ? 0 : b.length <= 6 ? b.readUIntBE(0, b.length) : b.length === 8 ? Number(b.readBigUInt64BE()) : 0);
const str = (b: Buffer) => b.toString("utf8").split("\0")[0].trim();

type MkvTrack = {
  format: Format;
  declared: string;
  title: string;
  forced: boolean;
  /** Seconds a block lasts unless it says otherwise. */
  duration: number | null;
  unpack: ((b: Buffer) => Buffer)[];
  cues: RawCue[];
};

const MKV_FORMATS: Record<string, Format> = {
  "S_TEXT/UTF8": "text",
  "S_TEXT/ASCII": "text",
  "S_TEXT/ASS": "ass",
  "S_TEXT/SSA": "ass",
  "S_ASS": "ass",
  "S_SSA": "ass",
  "S_TEXT/WEBVTT": "webvtt",
  "D_WEBVTT/SUBTITLES": "webvtt-block",
  "D_WEBVTT/CAPTIONS": "webvtt-block",
};

/** How to undo a track's compression, or null when it can't be read (encrypted, or bzip2/lzo that nobody writes any more). */
function unpackers(encodings: Buffer): MkvTrack["unpack"] | null {
  const steps: MkvTrack["unpack"] = [];
  for (const { id, data } of children(encodings)) {
    if (id !== ID.encoding) continue;
    for (const part of children(data)) {
      if (part.id === ID.encryption) return null;
      if (part.id !== ID.compression) continue;
      let algo = 0;
      let settings: Buffer = Buffer.alloc(0);
      for (const c of children(part.data)) {
        if (c.id === ID.compAlgo) algo = uint(c.data);
        if (c.id === ID.compSettings) settings = Buffer.from(c.data);
      }
      if (algo === 0) steps.unshift((b) => inflateSync(b, { maxOutputLength: MAX_CUE_BYTES }));
      else if (algo === 3) steps.unshift((b) => Buffer.concat([settings, b]));
      else return null;
    }
  }
  return steps;
}

function mkvTracks(body: Buffer) {
  const tracks = new Map<number, MkvTrack>();
  for (const entry of children(body)) {
    if (entry.id !== ID.trackEntry) continue;
    let number = 0;
    let type = 0;
    let codec = "";
    // Matroska says a track with no language is English; in practice it means nobody filled it in.
    let language = "";
    let bcp47 = "";
    let title = "";
    let forced = false;
    let duration: number | null = null;
    let unpack: MkvTrack["unpack"] | null = [];
    for (const { id, data } of children(entry.data)) {
      if (id === ID.trackNumber) number = uint(data);
      else if (id === ID.trackType) type = uint(data);
      else if (id === ID.codecId) codec = str(data);
      else if (id === ID.language) language = str(data);
      else if (id === ID.languageBcp47) bcp47 = str(data);
      else if (id === ID.name) title = str(data);
      else if (id === ID.forced) forced = uint(data) === 1;
      else if (id === ID.defaultDuration) duration = uint(data) / 1e9 || null;
      else if (id === ID.encodings) unpack = unpackers(data);
    }
    const format = MKV_FORMATS[codec];
    if (type !== SUBTITLE_TRACK || !format || !unpack || tracks.size >= MAX_TRACKS) continue;
    tracks.set(number, { format, declared: bcp47 || language, title, forced, duration, unpack, cues: [] });
  }
  return tracks;
}

async function matroskaSubtitles(source: ByteSource): Promise<SubtitleTrack[]> {
  const reader = new Reader(source);
  let scale = 1e6;
  let clusterTime = 0;
  let tracks: Map<number, MkvTrack> | null = null;
  let segments = 0;

  /** Keeps a block if it belongs to a subtitle track. `duration` is in timescale units. */
  const take = async (body: number, size: number, duration: number | null) => {
    const head = await reader.bytes(body, Math.min(12, size));
    const number = vint(head, 0, false);
    const track = number && tracks?.get(number.value);
    if (!track || head.length < number.length + 3) return;
    const flags = head[number.length + 2];
    const data = number.length + 3;
    // Subtitles are never laced (several frames packed in one block).
    if (flags & 0x06 || size - data > MAX_CUE_BYTES || track.cues.length >= MAX_CUES) return;
    const start = ((clusterTime + head.readInt16BE(number.length)) * scale) / 1e9;
    // Copied out, since it would otherwise keep the whole window in memory.
    let bytes: Buffer = Buffer.from(await reader.bytes(body + data, size - data));
    try {
      for (const step of track.unpack) bytes = step(bytes);
    } catch {
      return;
    }
    const length = duration === null ? track.duration : (duration * scale) / 1e9;
    track.cues.push({ start, end: length ? start + length : null, data: bytes });
  };

  for (let pos = 0; pos < source.size; ) {
    const el = await reader.element(pos);
    if (!el) break;
    // Segments and clusters are stepped into; their own sizes don't matter (and are often unknown).
    if (el.id === ID.segment) {
      if (segments++) break;
      pos = el.body;
      continue;
    }
    if (el.id === ID.cluster) {
      // Without a subtitle track there is no reason to walk gigabytes of film.
      if (!tracks?.size) break;
      clusterTime = 0;
      pos = el.body;
      continue;
    }
    if (el.size === null) break;
    const end = el.body + el.size;

    if (el.id === ID.info && el.size < MAX_CUE_BYTES) {
      for (const c of children(await reader.bytes(el.body, el.size))) if (c.id === ID.timescale) scale = uint(c.data) || scale;
    } else if (el.id === ID.tracks && el.size < 16 * 1024 * 1024) {
      tracks = mkvTracks(Buffer.from(await reader.bytes(el.body, el.size)));
    } else if (el.id === ID.clusterTime) {
      clusterTime = uint(await reader.bytes(el.body, el.size));
    } else if (el.id === ID.simpleBlock) {
      await take(el.body, el.size, null);
    } else if (el.id === ID.blockGroup) {
      let block: { body: number; size: number } | null = null;
      let duration: number | null = null;
      for (let p = el.body; p < end; ) {
        const child = await reader.element(p);
        if (!child || child.size === null) break;
        if (child.id === ID.block) block = { body: child.body, size: child.size };
        else if (child.id === ID.blockDuration) duration = uint(await reader.bytes(child.body, child.size));
        p = child.body + child.size;
      }
      if (block) await take(block.body, block.size, duration);
    }
    pos = end;
  }
  return [...(tracks?.values() ?? [])].flatMap(finish);
}

/* ---------- MP4 / MOV ---------- */

type Box = { type: string; body: Buffer };

/** The boxes directly inside a body that is already in memory. */
function* boxes(buf: Buffer): Generator<Box> {
  for (let p = 0; p + 8 <= buf.length; ) {
    let size = buf.readUInt32BE(p);
    let head = 8;
    if (size === 1 && p + 16 <= buf.length) {
      size = Number(buf.readBigUInt64BE(p + 8));
      head = 16;
    } else if (size === 0) {
      size = buf.length - p;
    }
    if (size < head || p + size > buf.length) return;
    yield { type: buf.toString("latin1", p + 4, p + 8), body: buf.subarray(p + head, p + size) };
    p += size;
  }
}

function find(buf: Buffer, ...path: string[]): Buffer | null {
  let at: Buffer | null = buf;
  for (const type of path) {
    let next: Buffer | null = null;
    for (const b of boxes(at)) {
      if (b.type === type) {
        next = b.body;
        break;
      }
    }
    if (!next) return null;
    at = next;
  }
  return at;
}

async function readMoov(source: ByteSource): Promise<Buffer | null> {
  let pos = 0;
  for (let i = 0; i < 10_000 && pos + 8 <= source.size; i++) {
    const head = await source.read(pos, 16);
    if (head.length < 8) return null;
    let size = head.readUInt32BE(0);
    let header = 8;
    if (size === 1 && head.length === 16) {
      size = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size === 0) {
      size = source.size - pos;
    }
    if (size < header) return null;
    if (head.toString("latin1", 4, 8) === "moov") return size > MAX_MOOV ? null : source.read(pos + header, size - header);
    pos += size;
  }
  return null;
}

/** Three letters packed five bits each, as MP4 writes languages. */
const mp4Language = (code: number) => (code < 0x400 ? "" : String.fromCharCode(0x60 + ((code >> 10) & 31), 0x60 + ((code >> 5) & 31), 0x60 + (code & 31)));

async function mp4Subtitles(source: ByteSource): Promise<SubtitleTrack[]> {
  const moov = await readMoov(source);
  if (!moov) return [];
  const mvhd = find(moov, "mvhd");
  const movieScale = mvhd ? mvhd.readUInt32BE(mvhd[0] === 1 ? 20 : 12) : 0;
  const traks = [...boxes(moov)].filter((b) => b.type === "trak").map((b) => b.body);
  // Chapter titles are kept as a text track too, one that other tracks point at.
  const chapters = new Set<number>();
  for (const trak of traks) {
    const chap = find(trak, "tref", "chap");
    for (let p = 0; chap && p + 4 <= chap.length; p += 4) chapters.add(chap.readUInt32BE(p));
  }
  const out: SubtitleTrack[] = [];
  for (const body of traks) {
    const tkhd = find(body, "tkhd");
    if (out.length >= MAX_TRACKS || !tkhd || tkhd.length < 24) continue;
    if (chapters.has(tkhd.readUInt32BE(tkhd[0] === 1 ? 20 : 12))) continue;
    try {
      const track = await mp4Track(source, body, movieScale);
      if (track) out.push(track);
    } catch (err) {
      // Tables pointing past their end: this track is broken, the others may not be.
      if (!(err instanceof RangeError)) throw err;
    }
  }
  return out;
}

async function mp4Track(source: ByteSource, trak: Buffer, movieScale: number): Promise<SubtitleTrack | null> {
  const mdia = find(trak, "mdia");
  const stbl = mdia && find(mdia, "minf", "stbl");
  const mdhd = mdia && find(mdia, "mdhd");
  const stsd = stbl && find(stbl, "stsd");
  if (!mdia || !stbl || !mdhd || !stsd || stsd.length < 16) return null;
  const format = ({ tx3g: "tx3g", wvtt: "wvtt" } as Record<string, Format>)[stsd.toString("latin1", 12, 16)];
  if (!format) return null;

  const v1 = mdhd[0] === 1;
  const scale = mdhd.readUInt32BE(v1 ? 20 : 12);
  const declared = mp4Language(mdhd.readUInt16BE(v1 ? 32 : 20));
  if (!scale) return null;

  // Sizes and places of the samples.
  const stsz = find(stbl, "stsz");
  const stsc = find(stbl, "stsc");
  const stts = find(stbl, "stts");
  const stco = find(stbl, "stco");
  const co64 = find(stbl, "co64");
  if (!stsz || !stsc || !stts || !(stco || co64)) return null;
  const fixed = stsz.readUInt32BE(4);
  // Every other sample is the gap between two lines.
  const count = Math.min(stsz.readUInt32BE(8), MAX_CUES * 2);
  const sizeOf = (i: number) => fixed || stsz.readUInt32BE(12 + i * 4);
  const chunks = (stco ?? co64)!.readUInt32BE(4);
  const chunkAt = (i: number) => (stco ? stco.readUInt32BE(8 + i * 4) : Number(co64!.readBigUInt64BE(8 + i * 8)));

  const samples: { start: number; end: number; offset: number; size: number }[] = [];
  const runs = stsc.readUInt32BE(4);
  for (let chunk = 0, run = 0; chunk < chunks && samples.length < count; chunk++) {
    while (run + 1 < runs && stsc.readUInt32BE(8 + (run + 1) * 12) <= chunk + 1) run++;
    const perChunk = stsc.readUInt32BE(8 + run * 12 + 4);
    let offset = chunkAt(chunk);
    for (let i = 0; i < perChunk && samples.length < count; i++) {
      const size = sizeOf(samples.length);
      samples.push({ start: 0, end: 0, offset, size });
      offset += size;
    }
  }

  // Times: runs of equally long samples, moved by the track's edit list (a delay, or a cut at the start).
  let shift = 0;
  const elst = find(trak, "edts", "elst");
  if (elst) {
    const wide = elst[0] === 1;
    const entry = wide ? 20 : 12;
    for (let i = 0; i < elst.readUInt32BE(4); i++) {
      const at = 8 + i * entry;
      const length = wide ? Number(elst.readBigUInt64BE(at)) : elst.readUInt32BE(at);
      const media = wide ? Number(elst.readBigInt64BE(at + 8)) : elst.readInt32BE(at + 4);
      if (media < 0) shift += movieScale ? length / movieScale : 0;
      else {
        shift -= media / scale;
        break;
      }
    }
  }
  let time = 0;
  for (let i = 0, run = 0, left = 0, delta = 0; i < samples.length; i++) {
    while (!left) {
      if (run >= stts.readUInt32BE(4)) break;
      left = stts.readUInt32BE(8 + run * 8);
      delta = stts.readUInt32BE(12 + run * 8);
      run++;
    }
    if (!left) break;
    left--;
    samples[i].start = time / scale + shift;
    time += delta;
    samples[i].end = time / scale + shift;
  }

  const cues: RawCue[] = [];
  // A two-byte sample is an empty line: the screen is clear.
  const lines = samples.filter((s) => s.end > s.start && s.size > 2 && s.size <= MAX_CUE_BYTES);
  for (let i = 0; i < lines.length; i += 16) {
    const batch = lines.slice(i, i + 16);
    const data = await Promise.all(batch.map((s) => source.read(s.offset, s.size)));
    batch.forEach((s, k) => cues.push({ start: s.start, end: s.end, data: data[k] }));
  }
  const hdlr = find(mdia, "hdlr");
  const title = hdlr ? str(hdlr.subarray(24)) : "";
  // What muxers write when nobody named the track.
  return finish({ format, declared, title: /handler|^gpac|^mainconcept/i.test(title) ? "" : title, forced: false, cues })[0] ?? null;
}

/* ---------- From raw lines to text ---------- */

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Persian subtitles made on old Windows were often muxed as they were, in windows-1256 rather than UTF-8. */
function decode(lines: Buffer[]): string[] {
  let broken = 0;
  const texts = lines.map((b) => {
    try {
      return utf8.decode(b);
    } catch {
      broken++;
      return null;
    }
  });
  if (!broken) return texts as string[];
  const fallback = new TextDecoder(broken > lines.length / 4 ? "windows-1256" : "utf-8");
  return texts.map((t, i) => t ?? fallback.decode(lines[i]));
}

/** MP4 timed text: a length, the text (UTF-8, or UTF-16 with a byte-order mark), then styling we don't use. */
function tx3g(data: Buffer): Buffer {
  const text = data.subarray(2, 2 + data.readUInt16BE(0));
  if (text[0] === 0xfe && text[1] === 0xff) return Buffer.from(new TextDecoder("utf-16be").decode(text));
  if (text[0] === 0xff && text[1] === 0xfe) return Buffer.from(new TextDecoder("utf-16le").decode(text));
  return text;
}

/** WebVTT in MP4: the sample holds a box per line, each with its text in `payl`. */
function wvtt(data: Buffer): Buffer {
  const out: Buffer[] = [];
  for (const b of boxes(data)) {
    const payload = b.type === "vttc" && find(b.body, "payl");
    if (payload) out.push(payload, Buffer.from("\n"));
  }
  return Buffer.concat(out);
}

/** The text field of an ASS line as Matroska stores it: ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text. */
function assText(line: string) {
  let at = 0;
  for (let i = 0; i < 8; i++) {
    at = line.indexOf(",", at) + 1;
    if (!at) return "";
  }
  return assWords(line.slice(at));
}

function assWords(text: string) {
  // {\p1} switches to drawing shapes: what follows is coordinates, not words.
  if (/\{[^}]*\\p[1-9]/.test(text)) return "";
  return text.replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", nbsp: " ", lrm: "‎", rlm: "‏" };

function toText(format: Format, raw: string) {
  let text = raw.replace(/^﻿/, "").replace(/\0/g, "").replace(/\r\n?/g, "\n");
  if (format === "ass") text = assText(text);
  // Older WebM: the cue's id and settings come first, a line each.
  if (format === "webvtt-block") text = text.split("\n").slice(2).join("\n");
  text = text
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:[a-z][^<>]*|\d[\d:.]*)>/gi, "");
  if (format === "webvtt" || format === "webvtt-block" || format === "wvtt") text = text.replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m);
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
}

/** Decodes a track's lines, puts them in order and works out its language. Nothing comes back for a track with no words. */
function finish(track: { format: Format; declared: string; title: string; forced: boolean; cues: RawCue[] }): SubtitleTrack[] {
  const unwrap = track.format === "tx3g" ? tx3g : track.format === "wvtt" ? wvtt : (b: Buffer) => b;
  const texts = decode(track.cues.map((c) => unwrap(c.data)));
  const cues = tidy(track.cues.map((c, i) => ({ start: c.start, end: c.end, text: toText(track.format, texts[i]) })));
  if (!cues.length) return [];
  return [{ lang: trackLanguage(track.declared, cues), title: track.title.slice(0, 80), forced: track.forced, cues }];
}

/** In order, each with an end, without empty or repeated lines. */
function tidy(raw: { start: number; end: number | null; text: string }[]): Cue[] {
  const lines = raw
    .map((c) => ({ ...c, start: Math.max(0, c.start) }))
    .filter((c) => c.text)
    .sort((a, b) => a.start - b.start);
  const cues: Cue[] = [];
  const seen = new Set<string>();
  lines.forEach((c, i) => {
    const next = lines.slice(i + 1, i + 20).find((n) => n.start > c.start)?.start ?? Infinity;
    const end = c.end ?? Math.min(next, c.start + DEFAULT_SHOW);
    // Styled subtitles repeat a line per layer (outline, shadow, fill); it should be read once.
    const key = `${c.start}|${end}|${c.text}`;
    if (end <= c.start || seen.has(key)) return;
    seen.add(key);
    cues.push({ start: c.start, end, text: c.text });
  });
  return cues;
}

/* ---------- Subtitle files ---------- */

/**
 * A whole file's text. Persian .srt files come in UTF-8, UTF-16 and, very often, windows-1256.
 * A UTF-8 file with the odd damaged character is still UTF-8.
 */
export function decodeFile(buf: Buffer) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  const text = new TextDecoder("utf-8").decode(buf);
  const broken = text.match(/\ufffd/g)?.length ?? 0;
  if (broken <= text.length * 0.01) return text;
  const arabic = new TextDecoder("windows-1256").decode(buf);
  const letters = arabic.match(/[\u0621-\u06d3]/g)?.length ?? 0;
  const latin = arabic.match(/[A-Za-z]/g)?.length ?? 0;
  return letters > latin ? arabic : new TextDecoder("windows-1252").decode(buf);
}

const TIMING = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/;

const clock = (h: string | undefined, m: string, s: string, fraction: string) =>
  Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(fraction.padEnd(3, "0")) / 1000;

function srtLines(text: string, vtt: boolean) {
  const rows = text.split("\n");
  const out: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const t = TIMING.exec(rows[i]);
    if (!t) continue;
    const body: string[] = [];
    // Some SRT files have blank lines inside a line of dialogue, others none between two; the next timing is what ends it.
    while (i + 1 < rows.length && !TIMING.test(rows[i + 1])) {
      if (vtt && !rows[i + 1].trim()) break;
      body.push(rows[++i]);
    }
    // The number of the next line, right above its timing.
    if (!vtt && i + 1 < rows.length && /^\s*[\d\u06f0-\u06f9]+\s*$/.test(body.at(-1) ?? "")) body.pop();
    out.push({ start: clock(t[1], t[2], t[3], t[4]), end: clock(t[5], t[6], t[7], t[8]), text: toText(vtt ? "webvtt" : "text", body.join("\n")) });
  }
  return out;
}

function assLines(text: string) {
  // Where each field is; the text always comes last and may have commas of its own.
  let fields = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];
  let events = false;
  const out: { start: number; end: number; text: string }[] = [];
  const time = (s: string | undefined) => {
    const m = /^\s*(\d+):(\d{1,2}):(\d{1,2})[.:](\d{1,3})/.exec(s ?? "");
    return m ? clock(m[1], m[2], m[3], m[4]) : null;
  };
  for (const row of text.split("\n")) {
    if (/^\s*\[/.test(row)) events = /^\s*\[events\]/i.test(row);
    if (!events) continue;
    const format = /^\s*format:(.*)$/i.exec(row);
    if (format) fields = format[1].split(",").map((f) => f.trim().toLowerCase());
    const line = /^\s*dialogue:(.*)$/i.exec(row);
    if (!line) continue;
    const parts = line[1].split(",");
    const start = time(parts[fields.indexOf("start")]);
    const end = time(parts[fields.indexOf("end")]);
    if (start === null || end === null) continue;
    out.push({ start, end, text: toText("text", assWords(parts.slice(fields.length - 1).join(","))) });
  }
  return out;
}

/** What "film.fa.srt" says about its language. Only common ones: "film.HD.srt" is not a language. */
const NAMED: Record<string, string> = {
  fa: "fa", per: "fa", fas: "fa", farsi: "fa", persian: "fa", en: "en", eng: "en", english: "en", ar: "ar", ara: "ar", arabic: "ar",
  fr: "fr", fre: "fr", de: "de", ger: "de", es: "es", spa: "es", tr: "tr", tur: "tr", ru: "ru", rus: "ru", ku: "ku", ckb: "ckb", az: "az",
};

/** Reads an .srt, .vtt, .ass or .ssa file. Null when there are no timed lines in it. */
export function parseSubtitleFile(buf: Buffer, fileName: string): SubtitleTrack | null {
  const text = decodeFile(buf).replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  const lines = /^\s*\[(script info|events)\]/im.test(text) ? assLines(text) : srtLines(text, /^\s*WEBVTT/.test(text));
  const cues = tidy(lines.slice(0, MAX_CUES));
  if (!cues.length) return null;
  const name = fileName.replace(/\.[a-z]{3,4}$/i, "");
  const named = /[.\-_ [(]([a-z]{2,7})[\])]?$/i.exec(name)?.[1].toLowerCase() ?? "";
  const title = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[._]+/g, " ").trim().slice(0, 80);
  return { lang: trackLanguage(NAMED[named] ?? "", cues), title, forced: false, cues };
}

/** The older three-letter codes that Intl doesn't know ("per" for Persian is the one that matters here). */
const LEGACY: Record<string, string> = {
  per: "fa", fre: "fr", ger: "de", chi: "zh", dut: "nl", gre: "el", cze: "cs", rum: "ro", slo: "sk", mac: "mk",
  may: "ms", alb: "sq", arm: "hy", baq: "eu", bur: "my", geo: "ka", ice: "is", tib: "bo", wel: "cy",
};

function canonical(code: string) {
  const c = code.trim().toLowerCase().replace(/_/g, "-");
  if (!c || c === "und" || c === "mis" || c === "zxx") return "und";
  try {
    return Intl.getCanonicalLocales(LEGACY[c] ?? c)[0] ?? "und";
  } catch {
    return "und";
  }
}

/** Other languages written with some of the same letters as Persian. */
const SIBLINGS = ["ur", "ps", "ku", "ckb", "ug", "sd", "az"];

/**
 * The track's language. Persian releases are often left without one, or marked English (Matroska's default)
 * or Arabic, so what is actually written decides between those.
 */
export function trackLanguage(declared: string, cues: Cue[]) {
  const lang = canonical(declared);
  const base = lang.split("-")[0];
  if (base === "fa" || SIBLINGS.includes(base)) return lang;
  const sample = cues.slice(0, 2000).map((c) => c.text).join("\n");
  const arabic = sample.match(/[ء-يٮ-ۓ]/g)?.length ?? 0;
  const latin = sample.match(/[A-Za-z]/g)?.length ?? 0;
  if (arabic <= latin) return lang;
  // Arabic has no پ چ ژ گ; in Persian they are over two letters in a hundred.
  const persian = sample.match(/[پچژگ]/g)?.length ?? 0;
  if (persian / arabic > 0.005) return "fa";
  if (base === "ar") return lang;
  // A line or two may well have none of them; this is a Persian app, so that is taken for Persian.
  return arabic < 300 || /[یک]/.test(sample) ? "fa" : "ar";
}

/* ---------- WebVTT ---------- */

function stamp(seconds: number) {
  const ms = Math.round(seconds * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(ms / 3_600_000))}:${two(Math.floor(ms / 60_000) % 60)}:${two(Math.floor(ms / 1000) % 60)}.${String(ms % 1000).padStart(3, "0")}`;
}

const escapeVtt = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const toVtt = (cues: Cue[]) =>
  `WEBVTT\n\n${cues.map((c) => `${stamp(c.start)} --> ${stamp(c.end)}\n${escapeVtt(c.text)}\n`).join("\n")}`;

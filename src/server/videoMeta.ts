import type { FileHandle } from "node:fs/promises";

/*
 * Reads a film's length from the file itself, so a film the server downloaded (with no browser around to
 * measure it) can still be put on the cinema clock. Only the two container families browsers play are read:
 * MP4 / MOV (the `mvhd` box) and WebM / Matroska (Segment → Info → Duration). Nothing is decoded and no
 * outside tool (ffprobe) is needed.
 */

async function readAt(file: FileHandle, position: number, length: number) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await file.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/** MP4 / MOV: walks the top-level boxes to `moov`, then reads its `mvhd` (the movie header). */
export async function mp4Duration(file: FileHandle, size: number): Promise<number | null> {
  let pos = 0;
  // A film has a handful of top-level boxes; the cap only guards against a malformed file looping forever.
  for (let i = 0; i < 10_000 && pos + 8 <= size; i++) {
    const head = await readAt(file, pos, 16);
    if (head.length < 8) return null;
    let boxSize = head.readUInt32BE(0);
    const type = head.toString("latin1", 4, 8);
    let header = 8;
    if (boxSize === 1) {
      if (head.length < 16) return null;
      boxSize = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (boxSize === 0) {
      boxSize = size - pos;
    }
    if (boxSize < header) return null;

    if (type === "moov") {
      const end = Math.min(size, pos + boxSize);
      for (let p = pos + header; p + 8 <= end; ) {
        const child = await readAt(file, p, 8);
        const childSize = child.readUInt32BE(0);
        if (childSize < 8) return null;
        if (child.toString("latin1", 4, 8) === "mvhd") {
          const body = await readAt(file, p + 8, 32);
          if (body.length < 20) return null;
          // Version 0 keeps times in 32 bits, version 1 in 64.
          const v1 = body[0] === 1;
          if (v1 && body.length < 32) return null;
          const timescale = body.readUInt32BE(v1 ? 20 : 12);
          const units = v1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
          return timescale ? units / timescale : null;
        }
        p += childSize;
      }
      return null;
    }
    pos += boxSize;
  }
  return null;
}

/** An EBML variable-length integer: element ids keep their length marker, sizes drop it. */
function vint(buf: Buffer, at: number, keepMarker: boolean) {
  const first = buf[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (at + length > buf.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === (keepMarker ? first : 0xff >> length);
  for (let i = 1; i < length; i++) {
    value = value * 256 + buf[at + i];
    if (buf[at + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

const EBML_HEADER = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const CLUSTER = 0x1f43b675;
const TIMESCALE = 0x2ad7b1;
const DURATION = 0x4489;

/** WebM / Matroska: Segment → Info, whose Duration counts in TimecodeScale nanoseconds (a millisecond by default). */
export function matroskaDuration(buf: Buffer): number | null {
  let pos = 0;
  let end = buf.length;
  while (pos < end) {
    const id = vint(buf, pos, true);
    if (!id) return null;
    const size = vint(buf, pos + id.length, false);
    if (!size) return null;
    const body = pos + id.length + size.length;

    if (id.value === SEGMENT) {
      // Step inside the segment; its size is often "unknown" for files written while recording.
      pos = body;
      end = size.unknown ? buf.length : Math.min(buf.length, body + size.value);
      continue;
    }
    if (id.value === INFO) {
      const infoEnd = Math.min(buf.length, body + size.value);
      let scale = 1_000_000;
      let duration: number | null = null;
      for (let p = body; p < infoEnd; ) {
        const cid = vint(buf, p, true);
        if (!cid) break;
        const csize = vint(buf, p + cid.length, false);
        if (!csize) break;
        const cbody = p + cid.length + csize.length;
        if (cbody + csize.value > buf.length) break;
        if (cid.value === TIMESCALE && csize.value <= 8) scale = buf.readUIntBE(cbody, Math.min(6, csize.value)) || scale;
        if (cid.value === DURATION) duration = csize.value === 4 ? buf.readFloatBE(cbody) : csize.value === 8 ? buf.readDoubleBE(cbody) : null;
        p = cbody + csize.value;
      }
      return duration && Number.isFinite(duration) ? (duration * scale) / 1e9 : null;
    }
    // Media data comes after Info in every file browsers make; reaching it means there is no length to read.
    if (id.value === CLUSTER || size.unknown) return null;
    if (id.value !== EBML_HEADER && pos === 0) return null;
    pos = body + size.value;
  }
  return null;
}

/** The film's length in seconds, or null when the file doesn't say. */
export async function videoDuration(file: FileHandle, size: number, contentType: string): Promise<number | null> {
  if (contentType === "video/mp4") return mp4Duration(file, size);
  // Matroska keeps Info near the start; a few megabytes is plenty even after a large SeekHead or attachments.
  return matroskaDuration(await readAt(file, 0, Math.min(size, 8 * 1024 * 1024)));
}

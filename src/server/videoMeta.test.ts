import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isPrivateAddress, parseLink } from "./movieImport";
import { matroskaDuration, videoDuration } from "./videoMeta";

const dir = await mkdtemp(path.join(tmpdir(), "videometa-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

function box(type: string, body: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
}

function mvhd(version: 0 | 1, timescale: number, units: number) {
  const body = Buffer.alloc(version ? 108 : 96);
  body[0] = version;
  if (version) {
    body.writeUInt32BE(timescale, 20);
    body.writeBigUInt64BE(BigInt(units), 24);
  } else {
    body.writeUInt32BE(timescale, 12);
    body.writeUInt32BE(units, 16);
  }
  return box("mvhd", body);
}

async function durationOf(bytes: Buffer, contentType: string) {
  const file = path.join(dir, `${Math.random()}`);
  await writeFile(file, bytes);
  const handle = await open(file, "r");
  try {
    return await videoDuration(handle, bytes.length, contentType);
  } finally {
    await handle.close();
  }
}

/** An EBML element: id bytes, then the size as a one-byte vint (bodies here stay under 127 bytes) or an 8-byte one. */
function el(id: number[], body: Buffer, unknownSize = false) {
  const size = unknownSize ? Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]) : Buffer.from([0x80 | body.length]);
  return Buffer.concat([Buffer.from(id), size, body]);
}

const f64 = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeDoubleBE(n);
  return b;
};

describe("videoDuration", () => {
  const ftyp = box("ftyp", Buffer.from("isom\0\0\0\0isommp42", "latin1"));

  it("reads an MP4 whose moov comes first", async () => {
    const file = Buffer.concat([ftyp, box("moov", mvhd(0, 1000, 5_400_000)), box("mdat", Buffer.alloc(64))]);
    expect(await durationOf(file, "video/mp4")).toBe(5400);
  });

  it("reads an MP4 whose moov comes last, with a 64-bit mvhd", async () => {
    const file = Buffer.concat([ftyp, box("free", Buffer.alloc(4)), box("mdat", Buffer.alloc(256)), box("moov", Buffer.concat([box("udta", Buffer.alloc(3)), mvhd(1, 90_000, 90_000 * 7261)]))]);
    expect(await durationOf(file, "video/mp4")).toBe(7261);
  });

  it("gives up on an MP4 without a movie header", async () => {
    expect(await durationOf(Buffer.concat([ftyp, box("mdat", Buffer.alloc(32))]), "video/mp4")).toBeNull();
  });

  it("reads WebM with the default and a custom timecode scale", async () => {
    const header = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], Buffer.from("webm")));
    const info = el([0x15, 0x49, 0xa9, 0x66], Buffer.concat([el([0x2a, 0xd7, 0xb1], Buffer.from([0x0f, 0x42, 0x40])), el([0x44, 0x89], f64(5_400_000))]));
    const segment = el([0x18, 0x53, 0x80, 0x67], Buffer.concat([el([0x11, 0x4d, 0x9b, 0x74], Buffer.alloc(10)), info]), true);
    expect(await durationOf(Buffer.concat([header, segment]), "video/webm")).toBe(5400);

    const micro = el([0x15, 0x49, 0xa9, 0x66], Buffer.concat([el([0x2a, 0xd7, 0xb1], Buffer.from([0x03, 0xe8])), el([0x44, 0x89], f64(2_000_000))]));
    expect(matroskaDuration(Buffer.concat([header, el([0x18, 0x53, 0x80, 0x67], micro, true)]))).toBe(2);
  });

  it("gives up on WebM recorded without a duration", async () => {
    const header = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], Buffer.from("webm")));
    const segment = el([0x18, 0x53, 0x80, 0x67], Buffer.concat([el([0x15, 0x49, 0xa9, 0x66], el([0x2a, 0xd7, 0xb1], Buffer.from([0x0f, 0x42, 0x40]))), el([0x1f, 0x43, 0xb6, 0x75], Buffer.alloc(8))]), true);
    expect(matroskaDuration(Buffer.concat([header, segment]))).toBeNull();
  });
});

describe("movie links", () => {
  it("refuses private and local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("accepts only public http(s) links", () => {
    expect(parseLink(" https://example.com/film.mp4 ").href).toBe("https://example.com/film.mp4");
    for (const bad of ["ftp://example.com/a.mp4", "file:///etc/passwd", "http://127.0.0.1/a.mp4", "http://[::1]/a", "http://localhost:3000/a", "https://user:pw@example.com/a", "not a link"]) {
      expect(() => parseLink(bad), bad).toThrow();
    }
  });
});

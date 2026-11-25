import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractSubtitles, toVtt, trackLanguage, type ByteSource } from "./subtitles";

const source = (buf: Buffer): ByteSource => ({ size: buf.length, read: async (p, n) => buf.subarray(p, p + n) });

/* ---------- Matroska, put together by hand ---------- */

/** An EBML element with an 8-byte size (or an unknown one). */
function el(id: number[], body: Buffer | Buffer[], unknownSize = false) {
  const data = Array.isArray(body) ? Buffer.concat(body) : body;
  const size = Buffer.alloc(8);
  size[0] = 1;
  if (unknownSize) size.fill(0xff, 1);
  else size.writeUIntBE(data.length, 2, 6);
  return Buffer.concat([Buffer.from(id), size, data]);
}

const byte = (n: number) => Buffer.from([n]);
const u16 = (n: number) => Buffer.from([n >> 8, n & 255]);

function track(number: number, codec: string, extra: Buffer[] = [], type = 0x11) {
  return el([0xae], [el([0xd7], byte(number)), el([0x83], byte(type)), el([0x86], Buffer.from(codec)), ...extra]);
}

const block = (number: number, at: number, data: Buffer) => Buffer.concat([byte(0x80 | number), u16(at), byte(0), data]);
const line = (number: number, at: number, duration: number, data: Buffer | string) =>
  el([0xa0], [el([0xa1], block(number, at, Buffer.from(data as Buffer))), el([0x9b], u16(duration))]);
const cluster = (time: number, ...blocks: Buffer[]) => el([0x1f, 0x43, 0xb6, 0x75], [el([0xe7], u16(time)), ...blocks], true);

function mkv(tracks: Buffer[], ...clusters: Buffer[]) {
  return Buffer.concat([
    el([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(4)),
    el([0x18, 0x53, 0x80, 0x67], [el([0x15, 0x49, 0xa9, 0x66], el([0x2a, 0xd7, 0xb1], Buffer.from([0x0f, 0x42, 0x40]))), el([0x16, 0x54, 0xae, 0x6b], tracks), ...clusters], true),
  ]);
}

const read = (file: Buffer, type = "video/webm") => extractSubtitles(source(file), type);

describe("subtitles in Matroska", () => {
  it("reads SRT lines across clusters, skipping the film itself", async () => {
    const film = el([0xa3], block(1, 0, Buffer.alloc(5000)));
    const [sub, ...rest] = await read(
      mkv(
        [track(1, "V_MPEG4/ISO/AVC", [], 1), track(2, "S_TEXT/UTF8", [el([0x22, 0xb5, 0x9c], Buffer.from("per"))])],
        cluster(0, film, line(2, 1000, 3000, "سلام <i>دنیا</i>\r\nخوبی؟")),
        cluster(10_000, film, line(2, 500, 1500, "{\\an8}خداحافظ")),
      ),
    );
    expect(rest).toEqual([]);
    expect(sub.lang).toBe("fa");
    expect(sub.cues).toEqual([
      { start: 1, end: 4, text: "سلام دنیا\nخوبی؟" },
      { start: 10.5, end: 12, text: "خداحافظ" },
    ]);
  });

  it("undoes zlib and header-stripping compression", async () => {
    const encodings = (...parts: Buffer[]) => el([0x6d, 0x80], el([0x62, 0x40], el([0x50, 0x34], parts)));
    const subs = await read(
      mkv(
        [
          track(2, "S_TEXT/UTF8", [encodings(el([0x42, 0x54], byte(0)))]),
          track(3, "S_TEXT/UTF8", [encodings(el([0x42, 0x54], byte(3)), el([0x42, 0x55], Buffer.from("Hel")))]),
        ],
        cluster(0, line(2, 0, 1000, deflateSync(Buffer.from("گفتگو"))), line(2, 2000, 1000, "not zlib"), line(3, 0, 1000, "lo")),
      ),
    );
    expect(subs.map((s) => s.cues.map((c) => c.text))).toEqual([["گفتگو"], ["Hello"]]);
  });

  it("reads ASS text without its styling, layers or drawings", async () => {
    const [sub] = await read(
      mkv(
        [track(2, "S_TEXT/ASS")],
        cluster(
          0,
          line(2, 0, 2000, "0,0,Default,,0,0,0,,{\\b1}سلام، چطوری؟\\Nخوبم"),
          line(2, 0, 2000, "1,1,Default,,0,0,0,,سلام، چطوری؟\\Nخوبم"),
          line(2, 100, 2000, "2,0,Default,,0,0,0,,{\\p1}m 0 0 l 100 0"),
        ),
      ),
    );
    expect(sub.cues).toEqual([{ start: 0, end: 2, text: "سلام، چطوری؟\nخوبم" }]);
  });

  it("reads Persian that was muxed as windows-1256", async () => {
    // سلام in windows-1256.
    const [sub] = await read(mkv([track(2, "S_TEXT/UTF8")], cluster(0, line(2, 0, 1000, Buffer.from([0xd3, 0xe1, 0xc7, 0xe3])))));
    expect(sub.cues[0].text).toBe("سلام");
  });

  it("ends a line with no duration at the next one", async () => {
    const [sub] = await read(
      mkv([track(2, "S_TEXT/UTF8")], cluster(0, el([0xa3], block(2, 0, Buffer.from("a"))), el([0xa3], block(2, 2000, Buffer.from("b"))))),
    );
    expect(sub.cues.map((c) => [c.start, c.end])).toEqual([[0, 2], [2, 7]]);
  });

  it("finds nothing in a film without text subtitles, or in garbage", async () => {
    expect(await read(mkv([track(1, "V_VP9", [], 1), track(2, "S_HDMV/PGS")], cluster(0, line(2, 0, 1000, "xx"))))).toEqual([]);
    expect(await read(Buffer.alloc(64))).toEqual([]);
    expect(await read(mkv([track(2, "S_TEXT/UTF8")], cluster(0, line(2, 0, 1000, "hi"))).subarray(0, 150))).toEqual([]);
  });
});

/* ---------- MP4, put together by hand ---------- */

const u32 = (...n: number[]) => {
  const b = Buffer.alloc(n.length * 4);
  n.forEach((v, i) => b.writeUInt32BE(v, i * 4));
  return b;
};
const box = (type: string, ...body: Buffer[]) => {
  const data = Buffer.concat(body);
  return Buffer.concat([u32(8 + data.length), Buffer.from(type, "latin1"), data]);
};

function mp4(samples: Buffer[], { delay = 0, broken = false } = {}) {
  const ftyp = box("ftyp", Buffer.from("isom\0\0\0\0"));
  const offset = ftyp.length + 8;
  const language = (("f".charCodeAt(0) - 0x60) << 10) | (("a".charCodeAt(0) - 0x60) << 5) | ("s".charCodeAt(0) - 0x60);
  const stbl = box(
    "stbl",
    box("stsd", u32(0, 1), box("tx3g", Buffer.alloc(30))),
    // Every sample is a second long.
    box("stts", u32(0, 1, samples.length, 1000)),
    box("stsc", u32(0, 1, 1, samples.length, 1)),
    box("stsz", u32(0, 0, broken ? 999 : samples.length, ...samples.map((s) => s.length))),
    box("stco", u32(0, 1, offset)),
  );
  const trak = box(
    "trak",
    box("tkhd", u32(0, 0, 0, 1, 0, 0)),
    box("edts", box("elst", u32(0, 2, delay * 600, 0xffffffff, 0x10000, 0, 0, 0x10000))),
    box("mdia", box("mdhd", u32(0, 0, 0, 1000, 0), u16(language), u16(0)), box("minf", stbl)),
  );
  return Buffer.concat([ftyp, box("mdat", ...samples), box("moov", box("mvhd", u32(0, 0, 0, 600, 0)), trak)]);
}

const timed = (text: string) => {
  const b = Buffer.from(text);
  return Buffer.concat([u16(b.length), b]);
};

describe("subtitles in MP4", () => {
  it("reads timed text, its gaps and its delay", async () => {
    const [sub] = await read(mp4([timed(""), timed("سلام"), timed(""), Buffer.concat([timed("دوباره"), box("styl", Buffer.alloc(14))])], { delay: 2 }), "video/mp4");
    expect(sub).toEqual({ lang: "fa", title: "", forced: false, cues: [{ start: 3, end: 4, text: "سلام" }, { start: 5, end: 6, text: "دوباره" }] });
  });

  it("survives broken tables", async () => {
    expect(await read(mp4([timed("سلام")], { broken: true }), "video/mp4")).toBeInstanceOf(Array);
    expect(await read(box("ftyp", Buffer.alloc(8)), "video/mp4")).toEqual([]);
  });
});

describe("trackLanguage", () => {
  const cues = (text: string) => [{ start: 0, end: 1, text }];
  it("trusts what is written over a wrong or missing label", () => {
    expect(trackLanguage("", cues("چرا این‌جا نشستی؟ پاشو بریم"))).toBe("fa");
    expect(trackLanguage("eng", cues("می‌خواهم با تو حرف بزنم، گوش کن"))).toBe("fa");
    expect(trackLanguage("ara", cues("گفتم که چیزی نگو"))).toBe("fa");
    expect(trackLanguage("ara", cues("مرحبا كيف حالك"))).toBe("ar");
    expect(trackLanguage("urd", cues("آپ کیسے ہیں"))).toBe("ur");
    expect(trackLanguage("eng", cues("Hello there"))).toBe("en");
    expect(trackLanguage("und", cues("Hello there"))).toBe("und");
  });
});

describe("toVtt", () => {
  it("writes times and escapes markup", () => {
    expect(toVtt([{ start: 3661.5, end: 3662, text: "a < b --> c & d" }])).toBe("WEBVTT\n\n01:01:01.500 --> 01:01:02.000\na &lt; b --&gt; c &amp; d\n");
  });
});

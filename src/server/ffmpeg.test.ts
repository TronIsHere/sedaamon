import { describe, expect, it } from "vitest";
import { planRepackage, repackageArgs, repackageProblem, type Probe, type ProbeStream } from "./ffmpeg";

const MP4 = "mov,mp4,m4a,3gp,3g2,mj2";
const MKV = "matroska,webm";
const video = (codec: string, tag = "", extra: Partial<ProbeStream> = {}): ProbeStream => ({ index: 0, codec_type: "video", codec_name: codec, codec_tag_string: tag, ...extra });
const audio = (index: number, codec: string, channels: number, def = 0): ProbeStream => ({ index, codec_type: "audio", codec_name: codec, channels, disposition: { default: def } });
const film = (format: string, ...streams: ProbeStream[]): Probe => ({ streams, format: { format_name: format, duration: "6000" } });

describe("planRepackage", () => {
  it("leaves films Safari already plays alone", () => {
    expect(planRepackage(film(MP4, video("h264", "avc1"), audio(1, "aac", 2)))).toEqual({ kind: "fine" });
    expect(planRepackage(film(MP4, video("hevc", "hvc1"), audio(1, "aac", 2)))).toEqual({ kind: "fine" });
  });

  it("repackages x265 in MKV and turns 5.1 sound into stereo", () => {
    expect(planRepackage(film(MKV, video("hevc"), audio(1, "eac3", 6, 1)))).toEqual({ kind: "repackage", video: 0, hevc: true, audio: [{ index: 1, copy: false }] });
    expect(planRepackage(film(MKV, video("hevc"), audio(1, "aac", 6)))).toMatchObject({ audio: [{ copy: false }] });
  });

  it("repackages an MP4 over its tag or its sound alone", () => {
    expect(planRepackage(film(MP4, video("hevc", "hev1"), audio(1, "aac", 2)))).toMatchObject({ kind: "repackage", audio: [{ copy: true }] });
    expect(planRepackage(film(MP4, video("h264", "avc1"), audio(1, "ac3", 6)))).toMatchObject({ kind: "repackage", hevc: false });
  });

  it("keeps every language, the default one first, and skips cover art", () => {
    const probe = film(MKV, video("mjpeg", "", { disposition: { attached_pic: 1 } }), video("h264", "", { index: 1 }), audio(2, "aac", 2), audio(3, "ac3", 6, 1));
    expect(planRepackage(probe)).toEqual({ kind: "repackage", video: 1, hevc: false, audio: [{ index: 3, copy: false }, { index: 2, copy: true }] });
  });

  it("says when repackaging can't help", () => {
    expect(planRepackage(film(MKV, video("vp9"), audio(1, "opus", 2)))).toEqual({ kind: "unsupported", codec: "vp9" });
    expect(planRepackage(film(MKV, audio(0, "aac", 2))).kind).toBe("unsupported");
  });
});

describe("repackaging", () => {
  const plan = planRepackage(film(MKV, video("hevc"), audio(1, "eac3", 6))) as Extract<ReturnType<typeof planRepackage>, { kind: "repackage" }>;

  it("copies the picture and only lets ffmpeg open local files", () => {
    const args = repackageArgs("/a", "video/webm", "/b", plan).join(" ");
    expect(args).toContain("-c:v copy -tag:v hvc1");
    expect(args).toContain("-c:a:0 aac -ac:a:0 2");
    expect(args).toContain("-protocol_whitelist file -f matroska -i file:/a");
  });

  it("rejects a result that is short, lost its sound or isn't playable", () => {
    const good = film(MP4, video("hevc", "hvc1"), audio(1, "aac", 2));
    expect(repackageProblem(good, plan, 6000)).toBeNull();
    expect(repackageProblem(good, plan, 7000)).not.toBeNull();
    expect(repackageProblem(film(MP4, video("hevc", "hvc1")), plan, 6000)).not.toBeNull();
    expect(repackageProblem(film(MP4, video("hevc", "hev1"), audio(1, "aac", 2)), plan, 6000)).not.toBeNull();
  });
});

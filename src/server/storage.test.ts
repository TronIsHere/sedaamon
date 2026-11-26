import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { webStream } from "./storage";

describe("webStream", () => {
  it("passes everything through in order", async () => {
    const body = await new Response(webStream(Readable.from([Buffer.from("ab"), Buffer.from("cd")]))).text();
    expect(body).toBe("abcd");
  });

  it("closes the source quietly when the reader leaves with a chunk on its way", async () => {
    const source = new Readable({ read() { setTimeout(() => this.push(Buffer.from("x")), 5); } });
    const reader = webStream(source).getReader();
    await reader.read();
    const pending = reader.read();
    await reader.cancel();
    await pending;
    await new Promise((r) => setTimeout(r, 20));
    expect(source.destroyed).toBe(true);
  });

  it("hands a failure to the reader, even one from before the first read", async () => {
    const source = new Readable({ read() {} });
    const stream = webStream(source);
    source.destroy(new Error("disk"));
    await new Promise((r) => setTimeout(r, 5));
    await expect(new Response(stream).text()).rejects.toThrow();
  });
});

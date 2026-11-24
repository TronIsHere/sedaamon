import { describe, expect, it, vi } from "vitest";
import { checkEnv } from "./env";

const good = {
  NODE_ENV: "production",
  MONGODB_URI: "mongodb://mongo/sedaamon",
  LIVEKIT_API_KEY: "APIk3y",
  LIVEKIT_API_SECRET: "a".repeat(48),
} as unknown as NodeJS.ProcessEnv;

describe("checkEnv", () => {
  it("never blocks development", () => {
    expect(() => checkEnv({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("accepts a complete production setup", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => checkEnv(good)).not.toThrow();
  });

  it("rejects the public development LiveKit keys", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dev = { ...good, LIVEKIT_API_KEY: "devkey", LIVEKIT_API_SECRET: "devsecret-local-only-not-for-production" };
    expect(() => checkEnv(dev)).toThrow(/Refusing to start/);
  });

  it("rejects a short or missing LiveKit secret", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => checkEnv({ ...good, LIVEKIT_API_SECRET: "short" })).toThrow();
    expect(() => checkEnv({ ...good, LIVEKIT_API_SECRET: undefined })).toThrow();
  });

  it("requires the whole S3 set once an endpoint is given", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => checkEnv({ ...good, S3_ENDPOINT: "https://s3.example.com" })).toThrow();
  });
});

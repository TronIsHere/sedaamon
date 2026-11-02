import mongoose from "mongoose";

// Shared on globalThis so Next's bundled route handlers and the custom server
// (server.ts) reuse one connection in the same process.
const g = globalThis as unknown as { __mongo?: Promise<typeof mongoose> };

export function connectDB() {
  if (!g.__mongo) {
    const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/sedaamon";
    g.__mongo = mongoose.connect(uri).catch((err) => {
      g.__mongo = undefined;
      throw err;
    });
  }
  return g.__mongo;
}

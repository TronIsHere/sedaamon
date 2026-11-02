import crypto from "node:crypto";
import type { Types } from "mongoose";
import { connectDB } from "./db";
import { Session, User } from "./models";

export const SESSION_COOKIE = "sid";
export const SESSION_DAYS = 30;

export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export async function createSession(userId: Types.ObjectId) {
  await connectDB();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await Session.create({ tokenHash: sha256(token), user: userId, expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(token: string) {
  await connectDB();
  await Session.deleteOne({ tokenHash: sha256(token) });
}

export async function userFromToken(token: string | undefined) {
  if (!token) return null;
  await connectDB();
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  return User.findById(session.user).lean();
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof userFromToken>>>;

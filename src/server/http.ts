import { cookies } from "next/headers";
import { connection } from "next/server";
import { isValidObjectId, type Types } from "mongoose";
import { z } from "zod";
import { can, type Permission } from "@/lib/permissions";
import { DM_SCOPE, type Role } from "@/lib/types";
import { connectDB } from "./db";
import { HttpError } from "./errors";
import { Channel, Conversation, Member } from "./models";
import { emitToServer, emitToUsers } from "./realtime";
import { SESSION_COOKIE, userFromToken } from "./session";

export { HttpError };

/** Wraps a route handler: returns plain values as JSON and turns errors into `{ error }` responses. */
export function handle<C>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      await connectDB();
      const result = await fn(req, ctx);
      return result instanceof Response ? result : Response.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      if (err instanceof z.ZodError) return Response.json({ error: "اطلاعات ارسالی درست نیست" }, { status: 400 });
      console.error(err);
      return Response.json({ error: "خطای سرور. کمی بعد دوباره تلاش کنید" }, { status: 500 });
    }
  };
}

export async function currentUser() {
  // Session lookup compares against the current time, so it must run at request time.
  await connection();
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "ابتدا وارد حساب خود شوید");
  return user;
}

export function assertId(id: string) {
  if (!isValidObjectId(id)) throw new HttpError(404, "پیدا نشد");
  return id;
}

export async function requireMember(serverId: string, userId: Types.ObjectId) {
  assertId(serverId);
  const member = await Member.findOne({ server: serverId, user: userId }).lean();
  if (!member) throw new HttpError(403, "عضو این سرور نیستید");
  return member;
}

export async function requireChannelAccess(channelId: string, userId: Types.ObjectId) {
  assertId(channelId);
  const channel = await Channel.findById(channelId).lean();
  if (!channel) throw new HttpError(404, "کانال پیدا نشد");
  const member = await requireMember(String(channel.server), userId);
  return { channel, member };
}

/** Where a message lives: a channel in a server, or a direct conversation. Both go through the same message routes. */
export interface MessageScope {
  /** The server's id, or `DM_SCOPE` for a direct conversation. */
  serverId: string;
  type: "text" | "voice" | "dm";
  /** Only server channels have a Member row; in a conversation everyone is an equal "member". */
  member: { role: Role; mutedUntil?: Date | null };
  isDm: boolean;
  /** Sends an event to everyone who can see these messages. */
  emit: (event: string, payload: unknown) => void;
  /** Records that a message was just sent. */
  touch: () => Promise<unknown>;
}

export async function requireMessageScope(channelId: string, userId: Types.ObjectId): Promise<MessageScope> {
  assertId(channelId);
  const channel = await Channel.findById(channelId).lean();
  if (channel) {
    const serverId = String(channel.server);
    const member = await requireMember(serverId, userId);
    return {
      serverId,
      type: channel.type,
      member: { role: member.role as Role, mutedUntil: member.mutedUntil },
      isDm: false,
      emit: (event, payload) => emitToServer(serverId, event, payload),
      touch: async () => {},
    };
  }

  const conversation = await Conversation.findById(channelId).lean();
  if (!conversation || !conversation.participants.some((p) => String(p) === String(userId))) throw new HttpError(404, "کانال پیدا نشد");
  const people = conversation.participants.map(String);
  return {
    serverId: DM_SCOPE,
    type: "dm",
    member: { role: "member", mutedUntil: null },
    isDm: true,
    emit: (event, payload) => emitToUsers(people, event, payload),
    touch: () => Conversation.updateOne({ _id: channelId }, { lastMessageAt: new Date() }),
  };
}

/** Muted members can read but not write: no messages, edits or reactions. */
export function assertCanWrite(member: { mutedUntil?: Date | null }) {
  if (member.mutedUntil && member.mutedUntil.getTime() > Date.now()) throw new HttpError(403, "شما در این سرور بی‌صدا شده‌اید");
}

export function assertPermission(member: { role: string }, permission: Permission, message = "اجازهٔ این کار را ندارید") {
  if (!can(member.role as Role, permission)) throw new HttpError(403, message);
}

import { cookies } from "next/headers";
import { connection } from "next/server";
import { isValidObjectId, type Types } from "mongoose";
import { z } from "zod";
import { can, NO_STANDING, type Permission, type Standing } from "@/lib/permissions";
import { DM_SCOPE } from "@/lib/types";
import { connectDB } from "./db";
import { HttpError } from "./errors";
import { channelAudience, memberCanView } from "./access";
import { Channel, Conversation } from "./models";
import { emitToAudience, emitToUsers } from "./realtime";
import { findMemberWithStanding } from "./roles";
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
  const member = await findMemberWithStanding(serverId, userId);
  if (!member) throw new HttpError(403, "عضو این سرور نیستید");
  return member;
}

export async function requireChannelAccess(channelId: string, userId: Types.ObjectId) {
  assertId(channelId);
  const channel = await Channel.findById(channelId).lean();
  if (!channel) throw new HttpError(404, "کانال پیدا نشد");
  const member = await requireMember(String(channel.server), userId);
  // A private channel doesn't admit to existing: to anyone outside it, it is simply not there.
  if (!memberCanView(channel, member)) throw new HttpError(404, "کانال پیدا نشد");
  return { channel, member };
}

/** Where a message lives: a channel in a server, or a direct conversation. Both go through the same message routes. */
export interface MessageScope {
  /** The server's id, or `DM_SCOPE` for a direct conversation. */
  serverId: string;
  type: "text" | "voice" | "dm";
  /** Who may see this channel's messages and pings: ids for a private channel, null when the whole server (or conversation) can. */
  audience: ReadonlySet<string> | null;
  /** Only server channels have a Member row; in a conversation everyone is an equal "member". */
  member: { standing: Standing; mutedUntil?: Date | null; rulesPending?: boolean };
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
    if (!memberCanView(channel, member)) throw new HttpError(404, "کانال پیدا نشد");
    const audience = await channelAudience(channel);
    return {
      serverId,
      type: channel.type,
      member: { standing: member.standing, mutedUntil: member.mutedUntil, rulesPending: !!member.rulesPending },
      isDm: false,
      audience: audience && new Set(audience),
      emit: (event, payload) => emitToAudience(serverId, audience, event, payload),
      touch: async () => {},
    };
  }

  const conversation = await Conversation.findById(channelId).lean();
  if (!conversation || !conversation.participants.some((p) => String(p) === String(userId))) throw new HttpError(404, "کانال پیدا نشد");
  const people = conversation.participants.map(String);
  return {
    serverId: DM_SCOPE,
    type: "dm",
    member: { standing: NO_STANDING, mutedUntil: null },
    isDm: true,
    audience: null,
    emit: (event, payload) => emitToUsers(people, event, payload),
    touch: () => Conversation.updateOne({ _id: channelId }, { lastMessageAt: new Date() }),
  };
}

/** Muted members, and newcomers who haven't accepted the rules yet, can read but not write: no messages, edits or reactions. */
export function assertCanWrite(member: { mutedUntil?: Date | null; rulesPending?: boolean }) {
  if (member.mutedUntil && member.mutedUntil.getTime() > Date.now()) throw new HttpError(403, "شما در این سرور بی‌صدا شده‌اید");
  if (member.rulesPending) throw new HttpError(403, "برای شرکت در گفت‌وگو، ابتدا قوانین سرور را بپذیرید");
}

export function assertPermission(member: { standing: Standing }, permission: Permission, message = "اجازهٔ این کار را ندارید") {
  if (!can(member.standing, permission)) throw new HttpError(403, message);
}

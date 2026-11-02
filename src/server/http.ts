import { cookies } from "next/headers";
import { connection } from "next/server";
import { isValidObjectId, type Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "./db";
import { Channel, Member } from "./models";
import { SESSION_COOKIE, userFromToken } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

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

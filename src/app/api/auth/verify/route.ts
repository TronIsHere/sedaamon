import { cookies } from "next/headers";
import { z } from "zod";
import { normalizePhone, toLatinDigits } from "@/lib/phone";
import { handle, HttpError } from "@/server/http";
import { Otp, User } from "@/server/models";
import { toMe } from "@/server/serialize";
import { createSession, SESSION_COOKIE, sha256 } from "@/server/session";

const MAX_ATTEMPTS = 5;
const COLORS = ["#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#65a30d", "#0891b2", "#c026d3"];

export const POST = handle(async (req) => {
  const body = z.object({ phone: z.string(), code: z.string() }).parse(await req.json());
  const phone = normalizePhone(body.phone);
  const code = toLatinDigits(body.code).trim();
  if (!phone) throw new HttpError(400, "شماره موبایل درست نیست");

  const otp = await Otp.findOne({ phone, expiresAt: { $gt: new Date() } });
  if (!otp) throw new HttpError(400, "کد منقضی شده است. دوباره درخواست کنید");
  if (otp.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "تعداد تلاش‌ها زیاد بود. کد جدید بگیرید");

  if (otp.codeHash !== sha256(`${phone}:${code}`)) {
    otp.attempts += 1;
    await otp.save();
    throw new HttpError(400, "کد واردشده اشتباه است");
  }
  await otp.deleteOne();

  const user =
    (await User.findOne({ phone }).lean()) ??
    (await User.create({ phone, color: COLORS[Math.floor(Math.random() * COLORS.length)] })).toObject();

  const session = await createSession(user._id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });

  return { user: toMe(user), needsName: !user.name };
});

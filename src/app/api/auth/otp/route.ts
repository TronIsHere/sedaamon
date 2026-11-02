import crypto from "node:crypto";
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { handle, HttpError } from "@/server/http";
import { Otp } from "@/server/models";
import { sha256 } from "@/server/session";
import { otpIsDevOnly, sendOtp } from "@/server/sms";

const RESEND_AFTER_MS = 60_000;
const VALID_FOR_MS = 2 * 60_000;

export const POST = handle(async (req) => {
  const body = z.object({ phone: z.string() }).parse(await req.json());
  const phone = normalizePhone(body.phone);
  if (!phone) throw new HttpError(400, "شماره موبایل درست نیست");

  const existing = await Otp.findOne({ phone }).lean();
  if (existing && Date.now() - existing.sentAt.getTime() < RESEND_AFTER_MS) {
    throw new HttpError(429, "کد قبلی هنوز معتبر است. یک دقیقه بعد دوباره تلاش کنید");
  }

  const code = crypto.randomInt(10000, 100000).toString();
  await Otp.updateOne(
    { phone },
    {
      phone,
      codeHash: sha256(`${phone}:${code}`),
      attempts: 0,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + VALID_FOR_MS),
    },
    { upsert: true },
  );
  await sendOtp(phone, code);

  return { phone, resendAfter: RESEND_AFTER_MS / 1000, devCode: otpIsDevOnly() ? code : undefined };
});

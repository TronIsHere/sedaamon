/**
 * OTP delivery. Both providers stay inside Iran's network:
 * - "console": prints the code to the server log (development only)
 * - "kavenegar": Kavenegar verify/lookup API with a template that has a single %token
 */
export async function sendOtp(phone: string, code: string) {
  const provider = process.env.SMS_PROVIDER ?? "console";

  if (provider === "console") {
    console.log(`[otp] ${phone} → ${code}`);
    return;
  }

  if (provider === "kavenegar") {
    const key = process.env.KAVENEGAR_API_KEY;
    const template = process.env.KAVENEGAR_TEMPLATE;
    if (!key || !template) throw new Error("KAVENEGAR_API_KEY and KAVENEGAR_TEMPLATE must be set");
    const params = new URLSearchParams({ receptor: phone, token: code, template });
    const res = await fetch(`https://api.kavenegar.com/v1/${key}/verify/lookup.json`, {
      method: "POST",
      body: params,
    });
    if (!res.ok) throw new Error(`Kavenegar responded ${res.status}: ${await res.text()}`);
    return;
  }

  throw new Error(`Unknown SMS_PROVIDER "${provider}"`);
}

/** True when codes are only logged, so the API may hand them back to make local testing easier. */
export const otpIsDevOnly = () =>
  (process.env.SMS_PROVIDER ?? "console") === "console" && process.env.NODE_ENV !== "production";

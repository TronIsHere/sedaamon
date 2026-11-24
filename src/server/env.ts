/**
 * Refuses to start a production server with settings that are unsafe or would fail on the first request,
 * and prints a warning for the ones that merely look wrong. Development is never blocked.
 */
export function checkEnv(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.MONGODB_URI) errors.push("MONGODB_URI is not set.");

  // LiveKit signs every voice token and checks every webhook with this pair; the dev pair is public knowledge.
  const key = env.LIVEKIT_API_KEY ?? "";
  const secret = env.LIVEKIT_API_SECRET ?? "";
  if (!key || !secret) errors.push("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set (same values as in livekit.yaml).");
  else if (key === "devkey" || secret.includes("devsecret"))
    errors.push("LIVEKIT_API_KEY / LIVEKIT_API_SECRET still hold the development values. Generate new ones: openssl rand -hex 24");
  else if (secret.length < 32) errors.push("LIVEKIT_API_SECRET must be at least 32 characters. Generate one: openssl rand -hex 24");

  if (env.S3_ENDPOINT) {
    for (const name of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"])
      if (!env[name]) errors.push(`S3_ENDPOINT is set, so ${name} must be set too.`);
  }

  if ((env.SMS_PROVIDER ?? "console") === "console")
    warnings.push("SMS_PROVIDER=console: login codes are only printed to the log, so nobody can sign in remotely. Use kavenegar for real users.");
  if (!env.ADMIN_PHONES) warnings.push("ADMIN_PHONES is empty: the /admin panel is disabled.");
  if (!env.SITE_URL) warnings.push("SITE_URL is not set: canonical links, the sitemap and share images will point at http://localhost:3000.");
  if (!env.LIVEKIT_PUBLIC_URL) warnings.push("LIVEKIT_PUBLIC_URL is not set: browsers will be sent to a guessed address (wss://rtc.your-domain is expected).");

  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[config] ${e}`);
    throw new Error(`Refusing to start: ${errors.length} configuration problem(s) above. See docs/en/configuration.md.`);
  }
}

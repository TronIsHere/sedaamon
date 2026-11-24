import { pauseCinemaIfEmpty } from "@/server/cinema";
import { handleLiveKitWebhook } from "@/server/livekit";

export async function POST(req: Request) {
  try {
    const left = await handleLiveKitWebhook(await req.text(), req.headers.get("authorization"));
    if (left) await pauseCinemaIfEmpty(left).catch((err) => console.error("[cinema]", err));
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[livekit webhook]", err);
    return new Response("invalid webhook", { status: 401 });
  }
}

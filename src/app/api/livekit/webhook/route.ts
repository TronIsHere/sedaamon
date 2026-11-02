import { handleLiveKitWebhook } from "@/server/livekit";

export async function POST(req: Request) {
  try {
    await handleLiveKitWebhook(await req.text(), req.headers.get("authorization"));
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[livekit webhook]", err);
    return new Response("invalid webhook", { status: 401 });
  }
}

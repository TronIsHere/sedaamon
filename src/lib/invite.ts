import { isTouchDevice } from "@/lib/mobile";
import type { ServerDTO } from "@/lib/types";

/** Phones get the system share sheet (Telegram, WhatsApp, SMS…); desktops copy the link. */
export async function shareInvite(server: ServerDTO, notify: (message: string) => void) {
  const url = `${window.location.origin}/invite/${server.inviteCode}`;
  if (navigator.share && isTouchDevice()) {
    try {
      await navigator.share({ title: server.name, text: `دعوت به «${server.name}» در صدامون`, url });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    notify("لینک دعوت کپی شد");
  } catch {
    notify(url);
  }
}

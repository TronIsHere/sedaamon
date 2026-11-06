// The Sedaamon desktop app (Tauri, in /desktop) loads this site in its window. These helpers talk to that shell;
// in a browser every one of them does nothing.

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

const invoke = (): Invoke | undefined =>
  typeof window === "undefined" ? undefined : (window as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke;

export const isDesktopApp = () => !!invoke();

function call(cmd: string, args: Record<string, unknown>) {
  invoke()?.(cmd, args).catch(() => {});
}

/** The count on the Dock icon (macOS) or taskbar button (Windows); 0 clears it. */
export const setDesktopBadge = (count: number) => call("set_badge", { count });

/** A native notification; `tag` comes back in a "notification" event when it is clicked. */
export const desktopNotify = (title: string, body: string, tag: string) => call("notify", { title, body, tag });

export interface DesktopVoiceState {
  channel: string;
  server: string;
  muted: boolean;
  deafened: boolean;
}

/** What the tray menu shows about the voice call; null once it ends. */
export const setDesktopVoice = (state: DesktopVoiceState | null) => call("set_voice", { state });

/** What the shell asks of the page: the tray menu, a clicked notification, or an opened sedamon:// link. */
export type DesktopEvent =
  | { type: "voice"; action: "mute" | "deafen" | "leave" }
  | { type: "notification"; tag: string }
  /** When no listener calls `preventDefault`, the window navigates to `url`. */
  | { type: "open"; path: string; url: string };

export function onDesktopEvent(listener: (detail: DesktopEvent, event: CustomEvent<DesktopEvent>) => void) {
  const handle = (e: Event) => listener((e as CustomEvent<DesktopEvent>).detail, e as CustomEvent<DesktopEvent>);
  window.addEventListener("sedaamon:desktop", handle);
  return () => window.removeEventListener("sedaamon:desktop", handle);
}

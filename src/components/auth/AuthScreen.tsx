import Link from "next/link";
import { redirect } from "next/navigation";
import { AudioLines } from "lucide-react";
import LoginForm, { type AuthMode } from "@/components/LoginForm";
import PixelScene from "@/components/auth/PixelScene";
import { currentUser } from "@/server/http";

/** Only allow same-site paths as the post-login destination. */
const safeNext = (value: string | string[] | undefined) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";

const withNext = (path: string, next: string) => (next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`);

/**
 * The login and sign-up screen: the form on a grey panel beside the pixel-drawn illustration. Both
 * routes run the same phone-and-code flow; the mode only changes the wording and the switch link.
 */
export default async function AuthScreen({
  mode,
  searchParams,
}: {
  mode: AuthMode;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  const user = await currentUser();
  if (user?.name) redirect(next);

  return (
    <main className="flex min-h-full bg-ink-950 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-safe-2 sm:p-4 lg:p-6">
      <div className="animate-pop-in mx-auto grid w-full max-w-6xl gap-2 rounded-[2rem] bg-ink-900 p-2 lg:min-h-[min(48rem,calc(100dvh-3rem))] lg:grid-cols-[1fr_1.05fr]">
        <section className="flex flex-col px-4 pt-3 pb-6 sm:px-8 lg:px-12 lg:pt-8 lg:pb-10">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 rounded-full">
              <span className="grid size-9 place-items-center rounded-full bg-accent-strong text-on-accent">
                <AudioLines className="size-5" />
              </span>
              <span className="text-lg font-extrabold">صدامون</span>
            </Link>
            <nav aria-label="ورود یا ثبت‌نام" className="flex items-center gap-1 rounded-full p-1 text-sm ring-1 ring-line">
              {(["login", "signup"] as const).map((m) => (
                <Link
                  key={m}
                  href={withNext(`/${m}`, next)}
                  aria-current={m === mode ? "page" : undefined}
                  className="rounded-full px-3.5 py-1.5 font-medium text-muted transition-colors hover:text-fg aria-[current=page]:bg-ink-700 aria-[current=page]:text-fg"
                >
                  {m === "login" ? "ورود" : "ثبت‌نام"}
                </Link>
              ))}
            </nav>
          </header>

          <div className="flex flex-1 items-center py-10 lg:py-0">
            <LoginForm
              mode={mode}
              next={next}
              startWithName={!!user}
              switchHref={withNext(mode === "login" ? "/signup" : "/login", next)}
            />
          </div>
        </section>

        <div className="relative order-first h-52 overflow-hidden rounded-[1.5rem] sm:h-72 lg:order-none lg:h-auto">
          <PixelScene src="/auth/scene.mp4" poster="/auth/scene.jpg" className="absolute inset-0" />
          <p className="absolute right-3 bottom-3 hidden items-center sm:flex gap-2 rounded-full bg-ink-950/70 px-3.5 py-2 text-xs font-medium backdrop-blur-md sm:right-4 sm:bottom-4 sm:text-sm">
            <span className="size-2 rounded-full bg-online" />
            صدای هم را بشنوید، هر جا که هستید
          </p>
        </div>
      </div>
    </main>
  );
}

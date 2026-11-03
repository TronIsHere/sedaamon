import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { currentUser } from "@/server/http";

/** Only allow same-site paths as the post-login destination. */
const safeNext = (value: string | string[] | undefined) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  const user = await currentUser();
  if (user?.name) redirect(next);

  return (
    <main className="grid bg-ink-950 min-h-full place-items-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-safe-4">
      <LoginForm next={next} startWithName={!!user} />
    </main>
  );
}

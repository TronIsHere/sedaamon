import { redirect } from "next/navigation";
import JoinInvite from "@/components/JoinInvite";
import { currentUser } from "@/server/http";
import { Member } from "@/server/models";
import { findServerByInvite } from "@/server/servers";

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  const user = await currentUser();
  if (!user?.name) redirect(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);

  const server = await findServerByInvite(code);
  const memberCount = server ? await Member.countDocuments({ server: server._id }) : 0;

  return (
    <main className="grid bg-ink-950 min-h-full place-items-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-safe-4">
      <JoinInvite code={code} server={server ? { name: server.name, memberCount } : null} />
    </main>
  );
}

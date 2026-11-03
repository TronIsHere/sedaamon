import { redirect } from "next/navigation";
import App from "@/components/app/App";
import Landing from "@/components/landing/Landing";
import { currentUser } from "@/server/http";
import { toMe } from "@/server/serialize";
import { listServers } from "@/server/servers";

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await currentUser();
  // Visitors without a session see the landing page; signed-in people who never picked a name finish signing up.
  if (!user) return <Landing />;
  if (!user.name) redirect("/login");

  const { server } = await searchParams;
  const servers = await listServers(user._id);

  return (
    <App
      me={toMe(user)}
      initialServers={servers}
      initialServerId={typeof server === "string" && servers.some((s) => s.id === server) ? server : servers[0]?.id}
    />
  );
}

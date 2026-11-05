import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Onboarding from "@/components/onboarding/Onboarding";
import { currentUser } from "@/server/http";
import { toMe } from "@/server/serialize";

// A personal setup screen; nothing here for search engines.
export const metadata: Metadata = { title: "شروع", robots: { index: false, follow: false } };

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user?.name) redirect("/login");
  if (!user.onboardingPending) redirect("/");

  return <Onboarding me={toMe(user)} initialUseCase={user.useCase ?? ""} initialInterests={user.interests ?? []} />;
}

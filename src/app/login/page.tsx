import type { Metadata } from "next";
import AuthScreen from "@/components/auth/AuthScreen";

// Signing in has nothing to rank for; the sign-up page is the one search results should show.
export const metadata: Metadata = { title: "ورود", robots: { index: false, follow: true } };

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return <AuthScreen mode="login" searchParams={searchParams} />;
}

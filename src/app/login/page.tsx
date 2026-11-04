import type { Metadata } from "next";
import AuthScreen from "@/components/auth/AuthScreen";

export const metadata: Metadata = { title: "ورود · صدامون" };

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return <AuthScreen mode="login" searchParams={searchParams} />;
}

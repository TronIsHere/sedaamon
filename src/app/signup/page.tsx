import type { Metadata } from "next";
import AuthScreen from "@/components/auth/AuthScreen";

export const metadata: Metadata = { title: "ثبت‌نام · صدامون" };

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return <AuthScreen mode="signup" searchParams={searchParams} />;
}

import type { Metadata } from "next";
import AuthScreen from "@/components/auth/AuthScreen";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata(
  "/signup",
  "ثبت‌نام",
  "در یک دقیقه با شماره‌ی موبایل در صدامون حساب بسازید، سرور خودتان را راه بیندازید و دوستانتان را به کانال صوتی دعوت کنید؛ بدون فیلترشکن.",
);

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return <AuthScreen mode="signup" searchParams={searchParams} />;
}

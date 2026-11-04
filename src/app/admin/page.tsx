import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AdminPanel from "@/components/admin/AdminPanel";
import { ToastProvider } from "@/components/ui/toast";
import { adminStats } from "@/server/admin";
import { isAdminPhone } from "@/server/admins";
import { currentUser } from "@/server/http";
import { toMe } from "@/server/serialize";

export const metadata: Metadata = { title: "پنل مدیریت", robots: { index: false } };

// Every page here depends on the session cookie, so render on each request.
export const instant = false;

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Anyone else gets the ordinary 404, so the page doesn't admit to existing.
  if (!isAdminPhone(user.phone)) notFound();

  return (
    <ToastProvider>
      <AdminPanel me={toMe(user)} initialStats={await adminStats()} />
    </ToastProvider>
  );
}

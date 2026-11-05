"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/phone";
import type { ServerDTO } from "@/lib/types";
import { ServerAvatar } from "@/components/app/Avatar";

export default function JoinInvite({
  code,
  server,
}: {
  code: string;
  server: { name: string; icon: string | null; memberCount: number } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<{ server: ServerDTO }>("/api/servers/join", { body: { code } });
      router.push(`/?server=${res.server.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm animate-pop-in rounded-[2rem] bg-ink-900 p-7 text-center">
      {server ? (
        <>
          <ServerAvatar name={server.name} icon={server.icon} className="mx-auto mb-4 size-16 rounded-full text-2xl" />
          <p className="text-sm text-muted">به این سرور دعوت شده‌اید</p>
          <h1 className="mt-1 text-xl font-bold">{server.name}</h1>
          <p className="mt-1 text-sm text-muted">{toPersianDigits(server.memberCount)} عضو</p>
          <button
            onClick={join}
            disabled={busy}
            className="btn-primary mt-6 w-full"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            پیوستن به سرور
          </button>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </>
      ) : (
        <>
          <h1 className="text-lg font-bold">این لینک دعوت معتبر نیست</h1>
          <p className="mt-2 text-sm text-muted">ممکن است لینک اشتباه کپی شده باشد.</p>
          <Link href="/" className="mt-6 inline-block text-accent hover:underline">
            بازگشت به صدامون
          </Link>
        </>
      )}
    </div>
  );
}

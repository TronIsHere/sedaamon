"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/phone";
import type { ServerDTO } from "@/lib/types";

export default function JoinInvite({
  code,
  server,
}: {
  code: string;
  server: { name: string; memberCount: number } | null;
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
    <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center shadow-2xl shadow-black/40">
      {server ? (
        <>
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-accent-strong/15 text-2xl font-bold text-accent">
            {server.name.trim()[0]}
          </span>
          <p className="text-sm text-muted">به این سرور دعوت شده‌اید</p>
          <h1 className="mt-1 text-xl font-bold">{server.name}</h1>
          <p className="mt-1 text-sm text-muted">{toPersianDigits(server.memberCount)} عضو</p>
          <button
            onClick={join}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-strong shadow-lg shadow-accent-strong/25 px-4 py-2.5 font-semibold text-white hover:bg-accent disabled:opacity-60"
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

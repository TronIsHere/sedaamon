"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { FriendsDTO, UserDTO } from "@/lib/types";
import Skeleton from "@/components/ui/skeleton";
import Avatar from "./Avatar";
import { Modal } from "./Dialogs";

type Tab = "friends" | "requests";

/** Your friends and the requests you have sent and received. People are added from their profile card. */
export default function FriendsDialog({
  friends,
  online,
  onClose,
  onOpenProfile,
  onChanged,
  onNotify,
}: {
  friends: FriendsDTO | null;
  online: Record<string, boolean>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onChanged: () => void;
  onNotify: (message: string) => void;
}) {
  const pending = (friends?.incoming.length ?? 0) + (friends?.outgoing.length ?? 0);
  const [tab, setTab] = useState<Tab>(friends?.incoming.length ? "requests" : "friends");
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (userId: string, method: "PATCH" | "DELETE") => {
    setBusyId(userId);
    try {
      await api(`/api/friends/${userId}`, { method });
      onChanged();
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  // Online friends first.
  const sortedFriends = [...(friends?.friends ?? [])].sort((a, b) => Number(!!online[b.id]) - Number(!!online[a.id]));

  return (
    <Modal title="دوستان" onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-ink-850 p-1 text-sm">
        <TabButton active={tab === "friends"} onClick={() => setTab("friends")}>
          دوستان
          {!!friends?.friends.length && <span className="ms-1 text-xs opacity-70">({toPersianDigits(friends.friends.length)})</span>}
        </TabButton>
        <TabButton active={tab === "requests"} onClick={() => setTab("requests")}>
          درخواست‌ها
          {pending > 0 && <span className="ms-1 text-xs opacity-70">({toPersianDigits(pending)})</span>}
          {!!friends?.incoming.length && tab !== "requests" && <span className="ms-1.5 inline-block size-2 rounded-full bg-accent" />}
        </TabButton>
      </div>

      {!friends ? (
        <div className="space-y-3 py-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-3 w-32 rounded-full" />
            </div>
          ))}
        </div>
      ) : tab === "friends" ? (
        sortedFriends.length ? (
          <ul className="space-y-1">
            {sortedFriends.map((u) => (
              <Row key={u.id} user={u} online={!!online[u.id]} subtitle={online[u.id] ? "آنلاین" : "آفلاین"} onOpen={() => onOpenProfile(u.id)} />
            ))}
          </ul>
        ) : (
          <Empty>هنوز دوستی ندارید. روی نام یکی از اعضای سرورها بزنید و «افزودن به دوستان» را انتخاب کنید.</Empty>
        )
      ) : pending ? (
        <div className="space-y-4">
          {friends.incoming.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold text-muted">دریافتی ({toPersianDigits(friends.incoming.length)})</h3>
              <ul className="space-y-1">
                {friends.incoming.map((u) => (
                  <Row key={u.id} user={u} online={!!online[u.id]} onOpen={() => onOpenProfile(u.id)}>
                    <IconButton label="پذیرفتن" disabled={busyId === u.id} className="bg-accent-strong text-on-accent hover:bg-accent" onClick={() => act(u.id, "PATCH")}>
                      <Check className="size-4" />
                    </IconButton>
                    <IconButton label="رد کردن" disabled={busyId === u.id} className="bg-ink-800 text-muted hover:text-danger" onClick={() => act(u.id, "DELETE")}>
                      <X className="size-4" />
                    </IconButton>
                  </Row>
                ))}
              </ul>
            </section>
          )}
          {friends.outgoing.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold text-muted">ارسال‌شده ({toPersianDigits(friends.outgoing.length)})</h3>
              <ul className="space-y-1">
                {friends.outgoing.map((u) => (
                  <Row key={u.id} user={u} online={!!online[u.id]} subtitle="در انتظار پذیرش" onOpen={() => onOpenProfile(u.id)}>
                    <IconButton label="لغو درخواست" disabled={busyId === u.id} className="bg-ink-800 text-muted hover:text-danger" onClick={() => act(u.id, "DELETE")}>
                      <X className="size-4" />
                    </IconButton>
                  </Row>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <Empty>درخواست دوستی در انتظار نیست.</Empty>
      )}
    </Modal>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded-full py-2 sm:py-1.5", active ? "bg-accent-strong text-on-accent" : "text-muted hover:text-fg")}>
      {children}
    </button>
  );
}

function Row({
  user,
  online,
  subtitle,
  onOpen,
  children,
}: {
  user: UserDTO;
  online: boolean;
  subtitle?: string;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 rounded-xl hover:bg-ink-850">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-start">
        <Avatar user={user} online={online} />
        <span className="min-w-0 leading-5">
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          {subtitle && <span className={cn("block text-xs", online ? "text-online" : "text-muted")}>{subtitle}</span>}
        </span>
      </button>
      {children && <div className="flex shrink-0 gap-1.5 pe-2">{children}</div>}
    </li>
  );
}

function IconButton({
  label,
  className,
  disabled,
  onClick,
  children,
}: {
  label: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("grid size-9 place-items-center rounded-full transition disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm leading-7 text-muted">{children}</p>;
}

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Clock, Coins, Frame, Image as ImageIcon, Loader2, Sticker as StickerIcon, Wallet, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/format";
import { toLatinDigits } from "@/lib/phone";
import { getSocket } from "@/lib/socket";
import { STICKER_PACKS } from "@/lib/stickers";
import {
  backgroundClass,
  findPackage,
  formatNumber,
  formatPoints,
  formatToman,
  POINTS_NAME,
  POINTS_PACKAGES,
  STORE_ITEMS,
  TOPUP_STATUS,
  type StoreItem,
  type StoreItemKind,
} from "@/lib/store";
import type { MeDTO, TopUpDTO, WalletDTO } from "@/lib/types";
import { CardToCard } from "@/components/ui/card-to-card";
import Avatar from "./Avatar";
import { Modal } from "./Dialogs";
import { StickerArt } from "./Stickers";

export type StoreTab = StoreItemKind | "wallet";

const TABS: { id: StoreTab; label: string; icon: typeof Frame }[] = [
  { id: "frame", label: "قاب عکس", icon: Frame },
  { id: "background", label: "پس‌زمینه", icon: ImageIcon },
  { id: "stickers", label: "استیکر", icon: StickerIcon },
  { id: "wallet", label: "کیف پول", icon: Wallet },
];

/** The store: looks and sticker packs bought with Seda Points, and the wallet where points are bought by card-to-card. */
export default function StoreDialog({
  me,
  initialTab = "frame",
  onMeChange,
  onClose,
  onNotify,
}: {
  me: MeDTO;
  initialTab?: StoreTab;
  onMeChange: (me: MeDTO) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [tab, setTab] = useState<StoreTab>(initialTab ?? "frame");
  const [wallet, setWallet] = useState<WalletDTO | null>(null);
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    api<{ wallet: WalletDTO }>("/api/store")
      .then((res) => setWallet(res.wallet))
      .catch((err) => setError((err as Error).message));
  }, []);
  useEffect(load, [load]);

  // An admin confirming a transfer reaches this window at once.
  useEffect(() => {
    const socket = getSocket();
    const onWallet = ({ points, inventory, topUp }: { points: number; inventory: string[]; topUp?: TopUpDTO }) => {
      setWallet((w) => w && { ...w, points, inventory, topUps: topUp ? w.topUps.map((t) => (t.id === topUp.id ? topUp : t)) : w.topUps });
    };
    socket.on("wallet:update", onWallet);
    return () => {
      socket.off("wallet:update", onWallet);
    };
  }, []);

  const points = wallet?.points ?? me.points;
  const inventory = wallet?.inventory ?? me.inventory;

  const buy = async (item: StoreItem) => {
    const res = await api<{ points: number; inventory: string[] }>("/api/store/buy", { body: { itemId: item.id } });
    setWallet((w) => w && { ...w, ...res });
    onMeChange({ ...me, ...res });
    onNotify(`«${item.name}» خریده شد`);
    // A look is put on straight away; that's almost always why it was bought.
    if (item.kind !== "stickers") await equip(item, true, res);
  };

  const equip = async (item: StoreItem, on: boolean, wallet?: { points: number; inventory: string[] }) => {
    const slot = item.kind === "frame" ? "frame" : "background";
    const res = await api<{ user: MeDTO }>("/api/store/equip", { body: { slot, itemId: on ? item.id : null } });
    setWallet((w) => w && { ...w, [slot]: on ? item.id : null });
    onMeChange({ ...res.user, ...(wallet ?? {}) });
  };

  return (
    <Modal title="فروشگاه" onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-accent-strong/15 py-1.5 ps-2 pe-4 text-accent ring-1 ring-accent/30">
          <span className="grid size-7 place-items-center rounded-full bg-accent-strong text-on-accent">
            <Coins className="size-4" />
          </span>
          <span className="text-sm">
            موجودی: <b className="font-bold tabular-nums">{formatPoints(points)}</b>
          </span>
        </div>
        {tab !== "wallet" && (
          <button type="button" onClick={() => setTab("wallet")} className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            خرید {POINTS_NAME}
          </button>
        )}
      </div>

      <div role="tablist" aria-label="بخش‌های فروشگاه" className="scrollbar-none mb-4 flex gap-1 overflow-x-auto rounded-full bg-ink-850 p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 whitespace-nowrap sm:py-1.5",
              tab === t.id ? "bg-accent-strong text-on-accent" : "text-muted hover:text-fg",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {error && !wallet ? (
        <p className="py-10 text-center text-sm text-danger">{error}</p>
      ) : tab === "wallet" ? (
        wallet ? (
          <WalletPanel wallet={wallet} onChange={(topUps) => setWallet({ ...wallet, topUps })} onNotify={onNotify} />
        ) : (
          <div className="grid place-items-center py-16 text-muted">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )
      ) : (
        <div role="tabpanel" className="grid gap-3 sm:grid-cols-2">
          {STORE_ITEMS.filter((i) => i.kind === tab).map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              me={me}
              owned={inventory.includes(item.id)}
              worn={item.kind === "frame" ? (wallet?.frame ?? me.frame) === item.id : (wallet?.background ?? me.background) === item.id}
              affordable={points >= item.price}
              onBuy={() => buy(item)}
              onEquip={(on) => equip(item, on)}
              onTopUp={() => setTab("wallet")}
              onNotify={onNotify}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function ItemCard({
  item,
  me,
  owned,
  worn,
  affordable,
  onBuy,
  onEquip,
  onTopUp,
  onNotify,
}: {
  item: StoreItem;
  me: MeDTO;
  owned: boolean;
  worn: boolean;
  affordable: boolean;
  onBuy: () => Promise<unknown>;
  onEquip: (on: boolean) => Promise<unknown>;
  onTopUp: () => void;
  onNotify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <article className={cn("flex flex-col overflow-hidden rounded-2xl bg-ink-850 ring-1", worn ? "ring-accent" : "ring-line")}>
      <ItemPreview item={item} me={me} />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold">{item.name}</h3>
          {item.animated && <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[11px] text-muted">متحرک</span>}
          {owned && (
            <span className="ms-auto inline-flex items-center gap-1 text-xs text-online">
              <Check className="size-3.5" />
              مال شما
            </span>
          )}
        </div>
        <p className="text-xs leading-5 text-muted">{item.hint}</p>
        <div className="mt-auto pt-2">
          {owned ? (
            item.kind === "stickers" ? (
              <p className="rounded-xl bg-ink-800 px-3 py-2 text-center text-xs text-muted">در جعبهٔ استیکرهای گفت‌وگو در دسترس است</p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onEquip(!worn))}
                className={cn("w-full rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-60", worn ? "bg-ink-700 text-fg hover:bg-ink-600" : "btn-primary")}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {worn ? "برداشتن" : "استفاده"}
              </button>
            )
          ) : !affordable ? (
            <button type="button" onClick={onTopUp} className="flex w-full items-center justify-between rounded-xl bg-ink-800 px-3 py-2 text-sm text-muted hover:text-fg">
              <span className="font-bold tabular-nums text-fg">{formatPoints(item.price)}</span>
              <span className="text-xs">پوینت کافی نیست · شارژ کیف پول</span>
            </button>
          ) : confirming ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button type="button" disabled={busy} onClick={() => run(onBuy)} className="btn-primary">
                {busy && <Loader2 className="size-4 animate-spin" />}
                خرید با {formatPoints(item.price)}
              </button>
              <button type="button" onClick={() => setConfirming(false)} aria-label="انصراف" className="grid size-10 place-items-center rounded-xl bg-ink-800 text-muted hover:text-fg">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="flex w-full items-center justify-between rounded-xl bg-ink-800 px-3 py-2 text-sm hover:bg-ink-700">
              <span className="font-bold tabular-nums">{formatPoints(item.price)}</span>
              <span className="text-accent">خرید</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Shows the item on the buyer's own picture and name, so it is chosen by how it looks on them. */
function ItemPreview({ item, me }: { item: StoreItem; me: MeDTO }) {
  if (item.kind === "frame") {
    return (
      <div className="grid h-32 place-items-center bg-[radial-gradient(circle_at_50%_40%,var(--color-ink-700),var(--color-ink-900))]">
        <Avatar user={{ ...me, frame: item.id }} size="lg" />
      </div>
    );
  }
  if (item.kind === "background") {
    return (
      <div className={cn("profile-bg flex h-32 items-end gap-3 p-3", backgroundClass(item.id))}>
        <Avatar user={me} size="md" />
        <p className="truncate pb-1 font-bold text-white drop-shadow">{me.name}</p>
      </div>
    );
  }
  const pack = STICKER_PACKS.find((p) => `stickers:${p.id}` === item.id);
  return (
    <div className="flex h-32 items-center justify-center gap-1 bg-ink-900 px-2">
      {pack?.stickers.slice(0, 3).map((s) => (
        <StickerArt key={s.id} id={s.id} size={84} />
      ))}
    </div>
  );
}

// ---- Wallet ------------------------------------------------------------------------------------

function WalletPanel({ wallet, onChange, onNotify }: { wallet: WalletDTO; onChange: (topUps: TopUpDTO[]) => void; onNotify: (message: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  // The server closes unpaid orders once they run out, so a pending one is still payable.
  const pending = wallet.topUps.find((t) => t.status === "pending");
  const put = (t: TopUpDTO) => onChange(wallet.topUps.some((x) => x.id === t.id) ? wallet.topUps.map((x) => (x.id === t.id ? t : x)) : [t, ...wallet.topUps]);

  const order = async (packageId: string) => {
    setBusy(packageId);
    setError(undefined);
    try {
      put((await api<{ topUp: TopUpDTO }>("/api/store/topups", { body: { packageId } })).topUp);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!wallet.card) {
    return <p className="rounded-2xl border border-line px-4 py-10 text-center text-sm leading-7 text-muted">خرید {POINTS_NAME} هنوز در این سرور راه‌اندازی نشده است.</p>;
  }

  const history = wallet.topUps.filter((t) => t.id !== pending?.id);

  return (
    <div className="space-y-5">
      {pending ? (
        <PayOrder topUp={pending} card={wallet.card} onChange={put} onNotify={onNotify} />
      ) : (
        <section aria-labelledby="packages" className="space-y-3">
          <h3 id="packages" className="text-sm text-muted">
            یک بسته را انتخاب کنید
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POINTS_PACKAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!!busy}
                onClick={() => order(p.id)}
                className="relative flex flex-col items-center gap-1 rounded-2xl bg-ink-850 px-3 pt-5 pb-3 ring-1 ring-line transition hover:ring-accent disabled:opacity-60"
              >
                {p.tag && <span className="absolute -top-2 rounded-full bg-accent-strong px-2 py-0.5 text-[11px] font-bold text-on-accent">{p.tag}</span>}
                <Coins className="size-6 text-accent" />
                <span className="text-lg font-black tabular-nums">{formatNumber(p.points)}</span>
                <span className="text-xs text-muted">پوینت</span>
                <span className="mt-1 text-sm font-semibold tabular-nums">{busy === p.id ? <Loader2 className="size-4 animate-spin" /> : formatToman(p.price)}</span>
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <p className="text-xs leading-6 text-muted">پرداخت کارت به کارت است. بعد از واریز، مدیر سایت پرداخت را بررسی می‌کند و پوینت‌ها به کیف پول شما اضافه می‌شود.</p>
        </section>
      )}

      {history.length > 0 && (
        <section aria-labelledby="history" className="space-y-2">
          <h3 id="history" className="text-sm text-muted">
            سفارش‌های شما
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-line">
            {history.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="font-semibold tabular-nums">{formatPoints(t.points)}</span>
                <span className="text-muted tabular-nums">{formatToman(t.amount)}</span>
                <span className="text-xs text-muted">{formatDateTime(t.createdAt)}</span>
                <StatusBadge status={t.status} />
                {t.status === "rejected" && t.note && <p className="w-full text-xs text-danger">{t.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: TopUpDTO["status"] }) {
  const { label, tone } = TOPUP_STATUS[status];
  return (
    <span
      className={cn(
        "ms-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "default" && "bg-ink-800 text-muted",
        tone === "accent" && "bg-accent-strong/15 text-accent",
        tone === "danger" && "bg-danger-strong/15 text-danger",
      )}
    >
      {status === "submitted" && <Clock className="size-3" />}
      {label}
    </span>
  );
}

/** The open order: where to send the money and exactly how much, then "I paid" with the card's last four digits. */
function PayOrder({
  topUp,
  card,
  onChange,
  onNotify,
}: {
  topUp: TopUpDTO;
  card: NonNullable<WalletDTO["card"]>;
  onChange: (t: TopUpDTO) => void;
  onNotify: (message: string) => void;
}) {
  const [last4, setLast4] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pack = findPackage(topUp.packageId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<{ topUp: TopUpDTO }>(`/api/store/topups/${topUp.id}`, { method: "PATCH", body: { cardLast4: toLatinDigits(last4), reference: toLatinDigits(reference) } });
      onChange(res.topUp);
      onNotify("ثبت شد. پس از تأیید مدیر، پوینت‌ها به کیف پول شما اضافه می‌شود");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      onChange((await api<{ topUp: TopUpDTO }>(`/api/store/topups/${topUp.id}`, { method: "DELETE" })).topUp);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="pay" className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-3">
        <h3 id="pay" className="font-bold">
          {formatPoints(topUp.points)}
          {pack && <span className="ms-2 text-sm font-normal text-muted">({formatToman(topUp.price)})</span>}
        </h3>
        <ol className="list-inside list-[persian] space-y-1.5 text-sm leading-7 text-muted marker:text-accent">
          <li>
            دقیقاً <b className="text-fg">{formatToman(topUp.amount)}</b> به کارت زیر واریز کنید.
          </li>
          <li>چهار رقم آخر کارتی را که از آن پول فرستادید بنویسید و «واریز کردم» را بزنید.</li>
          <li>بعد از تأیید مدیر، پوینت‌ها به کیف پول شما اضافه می‌شود.</li>
        </ol>
        <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs leading-6 text-amber-200 ring-1 ring-amber-400/20">
          چند تومان اضافه روی مبلغ برای این است که پرداخت شما در صورت‌حساب بانک زودتر پیدا شود. لطفاً مبلغ را گرد نکنید.
        </p>
        <p className="text-xs text-muted">این سفارش تا {formatDateTime(topUp.expiresAt)} باز است.</p>
      </div>
      <div className="space-y-4">
        <CardToCard number={card.number} holder={card.holder} amount={topUp.amount} />
        <form onSubmit={submit} className="space-y-3 border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">۴ رقم آخر کارت شما</span>
              <input
                className="field text-center tabular-nums"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/[^\d۰-۹]/g, ""))}
                placeholder="۱۲۳۴"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">شمارهٔ پیگیری (اختیاری)</span>
              <input className="field text-center tabular-nums" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button disabled={busy || toLatinDigits(last4).length !== 4} className="btn-primary w-full">
            {busy && <Loader2 className="size-4 animate-spin" />}
            واریز کردم
          </button>
          <button type="button" disabled={busy} onClick={cancel} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-ink-800 hover:text-fg">
            لغو این سفارش
          </button>
        </form>
      </div>
    </section>
  );
}

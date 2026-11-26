import crypto from "node:crypto";
import { isValidObjectId, type Types } from "mongoose";
import { findItem, findPackage, maxExtra, TOPUP_TTL_MS, type StoreItemKind } from "@/lib/store";
import type { AdminTopUpDTO, MeDTO, PaymentCardDTO, TopUpDTO, WalletDTO } from "@/lib/types";
import { HttpError } from "./errors";
import { TopUp, User, WalletTx } from "./models";
import { emitUserUpdate } from "./presence";
import { emitToUsers } from "./realtime";
import { toMe, toUser } from "./serialize";

/** At most this many orders waiting at once per person, so nobody can tie up the amounts. */
const MAX_OPEN = 3;

/** Where buyers send the money, from the environment. Without both values the store sells nothing for money. */
export function paymentCard(env: Record<string, string | undefined> = process.env): PaymentCardDTO | null {
  const number = (env.STORE_CARD_NUMBER ?? "").replace(/\D/g, "");
  const holder = (env.STORE_CARD_HOLDER ?? "").trim();
  return number.length === 16 && holder ? { number, holder } : null;
}

type TopUpDoc = {
  _id: Types.ObjectId;
  package: string;
  points: number;
  price: number;
  amount: number;
  status: TopUpDTO["status"];
  cardLast4?: string | null;
  reference?: string | null;
  createdAt: Date;
  submittedAt?: Date | null;
  expiresAt: Date;
  reviewedAt?: Date | null;
  note?: string | null;
};

const toTopUp = (t: TopUpDoc): TopUpDTO => ({
  id: String(t._id),
  packageId: t.package,
  points: t.points,
  price: t.price,
  amount: t.amount,
  status: t.status,
  cardLast4: t.cardLast4 ?? "",
  reference: t.reference ?? "",
  createdAt: t.createdAt.toISOString(),
  submittedAt: t.submittedAt?.toISOString() ?? null,
  expiresAt: t.expiresAt.toISOString(),
  reviewedAt: t.reviewedAt?.toISOString() ?? null,
  note: t.note ?? "",
});

/** Unpaid orders past their time give their amount back. Submitted ones wait for the admin however long it takes. */
async function expireStale() {
  await TopUp.updateMany({ status: "pending", expiresAt: { $lte: new Date() } }, { status: "expired", open: false });
}

export async function walletOf(userId: Types.ObjectId): Promise<WalletDTO> {
  await expireStale();
  const [user, topUps] = await Promise.all([
    User.findById(userId, { points: 1, inventory: 1, frame: 1, background: 1 }).lean(),
    TopUp.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  if (!user) throw new HttpError(404, "حساب پیدا نشد");
  return {
    points: user.points ?? 0,
    inventory: user.inventory ?? [],
    frame: user.frame ?? null,
    background: user.background ?? null,
    topUps: topUps.map(toTopUp),
    card: paymentCard(),
  };
}

/** Tells every open tab of this person what they now have. */
function pushWallet(userId: string, points: number, inventory: string[], topUp?: TopUpDTO) {
  emitToUsers([userId], "wallet:update", { points, inventory, topUp });
}

/**
 * Opens an order for a package. The sum asked for is the price plus a random extra of at most 1%, different from
 * every other open order, so a transfer can be matched to its order by its amount.
 */
export async function createTopUp(userId: Types.ObjectId, packageId: string): Promise<TopUpDTO> {
  if (!paymentCard()) throw new HttpError(503, "خرید پوینت هنوز راه‌اندازی نشده است");
  const pack = findPackage(packageId);
  if (!pack) throw new HttpError(400, "این بسته پیدا نشد");
  await expireStale();

  // Picking the same package again shows the order already waiting, rather than a second sum to pay.
  const waiting = await TopUp.findOne({ user: userId, package: pack.id, status: "pending" }).lean();
  if (waiting) return toTopUp(waiting);
  if ((await TopUp.countDocuments({ user: userId, open: true })) >= MAX_OPEN)
    throw new HttpError(429, "چند سفارش در انتظار دارید. صبر کنید تا بررسی شوند یا یکی را لغو کنید");

  for (let attempt = 0; attempt < 25; attempt++) {
    const amount = pack.price + crypto.randomInt(1, maxExtra(pack.price) + 1);
    try {
      const doc = await TopUp.create({
        user: userId,
        package: pack.id,
        points: pack.points,
        price: pack.price,
        amount,
        expiresAt: new Date(Date.now() + TOPUP_TTL_MS),
      });
      return toTopUp(doc.toObject());
    } catch (err) {
      // Another open order already asks for that amount; draw again.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  throw new HttpError(503, "الان سفارش‌های زیادی باز است. چند دقیقهٔ دیگر دوباره تلاش کنید");
}

/** The buyer says they paid, with the last four digits of their card (and the reference number, if they have it). */
export async function submitTopUp(userId: Types.ObjectId, id: string, input: { cardLast4: string; reference: string }): Promise<TopUpDTO> {
  if (!isValidObjectId(id)) throw new HttpError(404, "سفارش پیدا نشد");
  const cardLast4 = input.cardLast4.replace(/\D/g, "");
  if (cardLast4.length !== 4) throw new HttpError(400, "چهار رقم آخر کارتی را که از آن پول فرستادید بنویسید");
  const reference = input.reference.replace(/[^\dA-Za-z-]/g, "").slice(0, 40);
  await expireStale();
  const doc = await TopUp.findOneAndUpdate(
    { _id: id, user: userId, status: "pending" },
    { status: "submitted", cardLast4, reference, submittedAt: new Date() },
    { returnDocument: "after" },
  ).lean();
  if (!doc) throw new HttpError(409, "این سفارش دیگر منتظر واریز نیست. سفارش تازه‌ای بسازید");
  return toTopUp(doc);
}

export async function cancelTopUp(userId: Types.ObjectId, id: string): Promise<TopUpDTO> {
  if (!isValidObjectId(id)) throw new HttpError(404, "سفارش پیدا نشد");
  const doc = await TopUp.findOneAndUpdate({ _id: id, user: userId, status: "pending" }, { status: "cancelled", open: false }, { returnDocument: "after" }).lean();
  if (!doc) throw new HttpError(409, "فقط سفارشی را که هنوز پرداخت نشده می‌توان لغو کرد");
  return toTopUp(doc);
}

/** Spends points on an item. One update both checks the balance and takes the points, so a double tap can't overspend. */
export async function buyItem(userId: Types.ObjectId, itemId: string) {
  const item = findItem(itemId);
  if (!item) throw new HttpError(404, "این کالا در فروشگاه نیست");
  const user = await User.findOneAndUpdate(
    { _id: userId, points: { $gte: item.price }, inventory: { $ne: item.id } },
    { $inc: { points: -item.price }, $push: { inventory: item.id } },
    { returnDocument: "after" },
  ).lean();
  if (!user) {
    const current = await User.findById(userId, { points: 1, inventory: 1 }).lean();
    if (current?.inventory?.includes(item.id)) throw new HttpError(409, "این را قبلاً خریده‌اید");
    throw new HttpError(402, "پوینت کافی ندارید");
  }
  await WalletTx.create({ user: userId, delta: -item.price, balance: user.points, reason: "purchase", item: item.id });
  pushWallet(String(userId), user.points, user.inventory);
  return { points: user.points, inventory: user.inventory };
}

const SLOT_OF: Partial<Record<StoreItemKind, "frame" | "background">> = { frame: "frame", background: "background" };

/** Wears an owned look, or takes it off with null. Everyone who can see this person sees the change. */
export async function equipItem(userId: Types.ObjectId, slot: "frame" | "background", itemId: string | null): Promise<MeDTO> {
  if (itemId !== null) {
    const item = findItem(itemId);
    if (!item || SLOT_OF[item.kind] !== slot) throw new HttpError(400, "این کالا برای این جا نیست");
  }
  const filter = itemId ? { _id: userId, inventory: itemId } : { _id: userId };
  const user = await User.findOneAndUpdate(filter, { [slot]: itemId }, { returnDocument: "after" }).lean();
  if (!user) throw new HttpError(403, "اول باید این را بخرید");
  void emitUserUpdate(toUser(user));
  return toMe(user);
}

// ---- Admin -------------------------------------------------------------------------------------

export async function listTopUps(status: string): Promise<AdminTopUpDTO[]> {
  await expireStale();
  const filter: Record<string, unknown> = status === "all" ? {} : status === "open" ? { open: true } : { status };
  // Waiting ones oldest first (first come, first served); the rest newest first.
  const sort: Record<string, 1 | -1> = status === "submitted" || status === "open" ? { submittedAt: 1, createdAt: 1 } : { createdAt: -1 };
  const docs = await TopUp.find(filter).sort(sort).limit(200).lean();
  const users = await User.find({ _id: { $in: docs.map((d) => d.user) } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return docs.map((d) => {
    const u = byId.get(String(d.user));
    return { ...toTopUp(d), user: u ? { ...toUser(u), phone: u.phone } : null };
  });
}

/**
 * Approving adds the points once: the status moves first, in one update that only an unreviewed order can pass,
 * so two admins (or two clicks) can't credit the same transfer twice. Expired orders can still be approved, for
 * someone who paid but didn't press the button in time.
 */
export async function reviewTopUp(adminId: Types.ObjectId, id: string, action: "approve" | "reject", note: string): Promise<AdminTopUpDTO> {
  if (!isValidObjectId(id)) throw new HttpError(404, "سفارش پیدا نشد");
  const doc = await TopUp.findOneAndUpdate(
    { _id: id, status: { $in: ["pending", "submitted", "expired"] as TopUpDTO["status"][] } },
    { status: action === "approve" ? "approved" : "rejected", open: false, reviewedBy: adminId, reviewedAt: new Date(), note: note.trim().slice(0, 300) },
    { returnDocument: "after" },
  ).lean();
  if (!doc) throw new HttpError(409, "این سفارش قبلاً بررسی شده است");

  const user =
    action === "approve"
      ? await User.findByIdAndUpdate(doc.user, { $inc: { points: doc.points } }, { returnDocument: "after" }).lean()
      : await User.findById(doc.user).lean();
  if (user && action === "approve") await WalletTx.create({ user: user._id, delta: doc.points, balance: user.points, reason: "topup", topUp: doc._id });
  const dto = toTopUp(doc);
  if (user) pushWallet(String(user._id), user.points ?? 0, user.inventory ?? [], dto);
  return { ...dto, user: user ? { ...toUser(user), phone: user.phone } : null };
}

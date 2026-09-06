import { prisma } from "../db/prisma.js";
import type { User } from "@prisma/client";

/** آرشیو + آزاد کردن telegramId تا کاربر با شناسهٔ جدید بسازد.
 *  اگر coinCost > 0 باشد، همان تراکنش سکه را کم می‌کند؛ در صورت کمبود سکه false برمی‌گرداند.
 */
export async function deleteAccountPermanently(
  user: User,
  opts?: { coinCost?: number },
): Promise<boolean> {
  const coinCost = opts?.coinCost ?? 0;

  try {
    await prisma.$transaction(async (tx) => {
      if (coinCost > 0) {
        const debited = await tx.user.updateMany({
          where: {
            id: user.id,
            diamonds: { gte: coinCost },
            deletedAt: null,
          },
          data: { diamonds: { decrement: coinCost } },
        });
        if (debited.count !== 1) {
          throw new Error("DELETE_ACCOUNT_NO_COINS");
        }
      }

      await tx.deletedAccount.create({
        data: {
          originalUserId: user.id,
          telegramId: user.telegramId,
          username: user.username,
          displayName: user.displayName,
          gender: user.gender,
          age: user.age,
          province: user.province,
          city: user.city,
        },
      });

      // آزاد کردن شناسه یکتاها با مقادیر آرشیوی
      const stamp = Date.now().toString(36);
      await tx.user.update({
        where: { id: user.id },
        data: {
          telegramId: BigInt(`-${user.id}`), // دیگر با tg واقعی تداخل ندارد
          referralCode: `del_${user.id}_${stamp}`,
          anonCode: `delanon_${user.id}_${stamp}`,
          deletedAt: new Date(),
          isActive: false,
          registered: false,
          state: "deleted",
          chatPartnerId: null,
          pendingAnonTo: null,
          pendingDirectTo: null,
          pendingSellCard: null,
          pendingReportOther: null,
          photoFileId: null,
          photoPendingFileId: null,
          photoStatus: "none",
          faceVerified: false,
          facePendingFileId: null,
          facePendingKind: null,
          faceStatus: "none",
          username: null,
          displayName: `[حذف‌شده #${user.id}]`,
        },
      });
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.message === "DELETE_ACCOUNT_NO_COINS") {
      return false;
    }
    throw err;
  }
}

export async function previousAccountIds(telegramId: bigint | number) {
  const rows = await prisma.deletedAccount.findMany({
    where: { telegramId: BigInt(telegramId) },
    orderBy: { deletedAt: "desc" },
    take: 10,
  });
  return rows;
}

export async function formatAdminUserLine(user: {
  id: number;
  telegramId: bigint;
  displayName: string | null;
  username?: string | null;
}) {
  const prev = await previousAccountIds(user.telegramId);
  const lines = [
    `کاربر: ${user.displayName ?? "—"}`,
    user.username ? `یوزرنیم: @${user.username}` : null,
    `شناسه فعلی: #${user.id}`,
    `تلگرام: ${user.telegramId}`,
  ];
  if (prev.length) {
    lines.push(
      `شناسه‌های قدیمی: ${prev.map((p) => `#${p.originalUserId}`).join("، ")}`,
    );
    const last = prev[0]!;
    lines.push(
      `آخرین حذف: ${last.displayName ?? "—"} | ${last.province ?? "—"}، ${last.city ?? "—"} | ${last.deletedAt.toLocaleString("fa-IR")}`,
    );
  }
  return lines.filter(Boolean).join("\n");
}

/** اگر رکورد حذف‌شدهٔ قدیمی با همان tg مانده، آزادش کن */
export async function releaseIfSoftDeleted(telegramId: number) {
  const existing = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });
  if (existing?.deletedAt) {
    await deleteAccountPermanently(existing);
    return true;
  }
  return false;
}

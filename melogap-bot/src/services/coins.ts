import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { COIN_PACKAGES } from "../data/packages.js";

export function findPackage(id: string) {
  return COIN_PACKAGES.find((p) => p.id === id);
}

export async function createOrder(userId: number, packageId: string) {
  const pkg = findPackage(packageId);
  if (!pkg) return null;

  const paymentCode = randomBytes(8).toString("hex");
  return prisma.coinOrder.create({
    data: {
      userId,
      packageId: pkg.id,
      coins: pkg.coins,
      amountToman: pkg.toman,
      paymentCode,
      status: "pending",
    },
  });
}

export function paymentUrl(paymentCode: string): string {
  // درگاه واقعی بعداً وصل می‌شه؛ فعلاً لینک دمو شبیه ملوگپ
  return `https://pay.dordoriya.app/mypay/${paymentCode}`;
}

export async function markPaid(orderId: number, userId: number) {
  const order = await prisma.coinOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) return null;
  if (order.status === "paid") return order;

  await prisma.$transaction([
    prisma.coinOrder.update({
      where: { id: orderId },
      data: { status: "paid" },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { coins: { increment: order.coins } },
    }),
  ]);

  return prisma.coinOrder.findUnique({ where: { id: orderId } });
}

export async function cancelOrder(orderId: number, userId: number) {
  const order = await prisma.coinOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId || order.status !== "pending") {
    return null;
  }
  return prisma.coinOrder.update({
    where: { id: orderId },
    data: { status: "cancelled" },
  });
}

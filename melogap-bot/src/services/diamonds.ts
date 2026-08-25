import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { DIAMOND_PACKAGES } from "../data/packages.js";

export function findPackage(id: string) {
  return DIAMOND_PACKAGES.find((p) => p.id === id);
}

export async function createOrder(userId: number, packageId: string) {
  const pkg = findPackage(packageId);
  if (!pkg) return null;
  return prisma.diamondOrder.create({
    data: {
      userId,
      packageId: pkg.id,
      diamonds: pkg.diamonds,
      amountToman: pkg.toman,
      paymentCode: randomBytes(8).toString("hex"),
      status: "pending",
    },
  });
}

export function paymentUrl(paymentCode: string): string {
  return `https://pay.dordoriya.app/mypay/${paymentCode}`;
}

export async function markPaid(orderId: number, userId: number) {
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) return null;
  if (order.status === "paid") return order;

  await prisma.$transaction([
    prisma.diamondOrder.update({
      where: { id: orderId },
      data: { status: "paid" },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { diamonds: { increment: order.diamonds } },
    }),
  ]);
  return prisma.diamondOrder.findUnique({ where: { id: orderId } });
}

export async function cancelOrder(orderId: number, userId: number) {
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId || order.status !== "pending") return null;
  return prisma.diamondOrder.update({
    where: { id: orderId },
    data: { status: "cancelled" },
  });
}

import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";

function generateReferralCode(): string {
  return randomBytes(4).toString("hex");
}

export async function upsertUser(params: {
  telegramId: number;
  username?: string;
  firstName?: string;
  referralCodeFromStart?: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { telegramId: BigInt(params.telegramId) },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        username: params.username ?? existing.username,
        firstName: params.firstName ?? existing.firstName,
      },
    });
  }

  let referredById: number | null = null;
  if (params.referralCodeFromStart) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: params.referralCodeFromStart },
    });
    if (referrer && referrer.telegramId !== BigInt(params.telegramId)) {
      referredById = referrer.id;
    }
  }

  let referralCode = generateReferralCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.user.findUnique({ where: { referralCode } });
    if (!clash) break;
    referralCode = generateReferralCode();
  }

  return prisma.user.create({
    data: {
      telegramId: BigInt(params.telegramId),
      username: params.username ?? null,
      firstName: params.firstName ?? null,
      referralCode,
      referredById,
    },
  });
}

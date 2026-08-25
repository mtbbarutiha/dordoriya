import { randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import { REFERRAL_BONUS } from "../data/packages.js";

function code(bytes = 4): string {
  return randomBytes(bytes).toString("hex");
}

async function uniqueCode(
  field: "referralCode" | "anonCode",
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const value = code();
    const clash = await prisma.user.findFirst({ where: { [field]: value } });
    if (!clash) return value;
  }
  return code(8);
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
        lastActiveAt: new Date(),
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

  const referralCode = await uniqueCode("referralCode");
  const anonCode = await uniqueCode("anonCode");

  const user = await prisma.user.create({
    data: {
      telegramId: BigInt(params.telegramId),
      username: params.username ?? null,
      firstName: params.firstName ?? null,
      referralCode,
      anonCode,
      referredById,
      coins: 20,
    },
  });

  if (referredById) {
    await prisma.user.update({
      where: { id: referredById },
      data: { coins: { increment: REFERRAL_BONUS } },
    });
  }

  return user;
}

export async function getByTelegramId(telegramId: number) {
  return prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });
}

export async function setState(
  userId: number,
  state: string,
  extra: Record<string, unknown> = {},
) {
  return prisma.user.update({
    where: { id: userId },
    data: { state, lastActiveAt: new Date(), ...extra },
  });
}

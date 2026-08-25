import { randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import { REFERRAL_BONUS, WELCOME_DIAMONDS } from "../data/packages.js";

function code(bytes = 4): string {
  return randomBytes(bytes).toString("hex");
}

async function uniqueCode(field: "referralCode" | "anonCode"): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const value = code();
    const clash = await prisma.user.findFirst({ where: { [field]: value } });
    if (!clash) return value;
  }
  return code(8);
}

export async function findByTelegram(telegramId: number) {
  return prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });
}

export async function ensureUser(params: {
  telegramId: number;
  username?: string;
  firstName?: string;
  referralCodeFromStart?: string;
}) {
  const existing = await findByTelegram(params.telegramId);
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
    if (referrer && Number(referrer.telegramId) !== params.telegramId) {
      referredById = referrer.id;
    }
  }

  const user = await prisma.user.create({
    data: {
      telegramId: BigInt(params.telegramId),
      username: params.username ?? null,
      firstName: params.firstName ?? null,
      referralCode: await uniqueCode("referralCode"),
      anonCode: await uniqueCode("anonCode"),
      referredById,
      diamonds: WELCOME_DIAMONDS,
      registered: false,
      state: "language",
    },
  });

  if (referredById) {
    await prisma.user.update({
      where: { id: referredById },
      data: { diamonds: { increment: REFERRAL_BONUS } },
    });
  }

  return user;
}

export async function patchUser(
  userId: number,
  data: Parameters<typeof prisma.user.update>[0]["data"],
) {
  return prisma.user.update({
    where: { id: userId },
    data: { ...data, lastActiveAt: new Date() },
  });
}

export function isRegistered(user: { registered: boolean }): boolean {
  return user.registered;
}

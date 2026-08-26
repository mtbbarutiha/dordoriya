import type { Api } from "grammy";
import { prisma } from "../db/prisma.js";

/** ثبت message_id برای پاک‌سازی بعدی گفتگو */
export async function logChatMessage(
  ownerUserId: number,
  partnerUserId: number,
  telegramChatId: number | bigint,
  messageId: number,
) {
  await prisma.chatMsgLog.create({
    data: {
      ownerUserId,
      partnerUserId,
      telegramChatId: BigInt(telegramChatId),
      messageId,
    },
  });
}

export async function logPairMessages(opts: {
  aUserId: number;
  bUserId: number;
  aChatId: number | bigint;
  bChatId: number | bigint;
  aMessageId: number;
  bMessageId: number;
}) {
  await prisma.chatMsgLog.createMany({
    data: [
      {
        ownerUserId: opts.aUserId,
        partnerUserId: opts.bUserId,
        telegramChatId: BigInt(opts.aChatId),
        messageId: opts.aMessageId,
      },
      {
        ownerUserId: opts.bUserId,
        partnerUserId: opts.aUserId,
        telegramChatId: BigInt(opts.bChatId),
        messageId: opts.bMessageId,
      },
    ],
  });
}

/** حذف پیام‌های رله‌شده این گفتگو از چت کاربر با ربات */
export async function wipeChatWithPartner(
  api: Api,
  userId: number,
  partnerUserId: number,
): Promise<number> {
  const rows = await prisma.chatMsgLog.findMany({
    where: { ownerUserId: userId, partnerUserId },
    orderBy: { id: "asc" },
    take: 400,
  });
  let deleted = 0;
  for (const row of rows) {
    try {
      await api.deleteMessage(Number(row.telegramChatId), row.messageId);
      deleted++;
    } catch {
      /* already gone / too old */
    }
  }
  await prisma.chatMsgLog.deleteMany({
    where: { ownerUserId: userId, partnerUserId },
  });
  return deleted;
}

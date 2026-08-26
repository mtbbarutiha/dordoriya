import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../db/prisma.js";
import { patchUser } from "../db/users.js";
import {
  chattingKeyboard,
  mainKeyboard,
  waitingKeyboard,
} from "../keyboards/main.js";
import { logPairMessages, logChatMessage } from "./chatLog.js";

export function chatRequestKeyboard(requestId: number) {
  return new InlineKeyboard()
    .text("✅ قبول چت", `chatreq:ok:${requestId}`)
    .text("❌ رد", `chatreq:no:${requestId}`);
}

export function wipeChatKeyboard(partnerUserId: number) {
  return new InlineKeyboard().text(
    "🗑 پاک کردن این گفتگو",
    `chat:wipe:${partnerUserId}`,
  );
}

export async function leaveQueueOrChat(
  api: Api,
  user: {
    id: number;
    telegramId: bigint;
    state: string;
    chatPartnerId: number | null;
  },
  notifyPartner = true,
) {
  const partnerId = user.chatPartnerId;
  const wasChatting = user.state === "chatting" && partnerId != null;

  if (wasChatting || partnerId != null) {
    const partner = partnerId
      ? await prisma.user.findUnique({ where: { id: partnerId } })
      : null;
    await patchUser(user.id, {
      state: "idle",
      chatPartnerId: null,
      secureChat: false,
    });
    if (partner) {
      const partnerStillLinked =
        partner.chatPartnerId === user.id || partner.state === "chatting";
      if (partnerStillLinked) {
        await patchUser(partner.id, {
          state: "idle",
          chatPartnerId: null,
          secureChat: false,
        });
        if (notifyPartner && wasChatting && partner.telegramId < 9000000000n) {
          try {
            const endText = [
              "طرف مقابل چت را قطع کرد.",
              "",
              "می‌توانی پیام‌های این گفتگو را از چت ربات پاک کنی.",
              "⚠️ فقط پیام‌هایی که ربات فرستاده پاک می‌شوند.",
              "برای پاک‌کردن کامل تاریخچه در تلگرام: روی چت بزن → Clear history.",
            ].join("\n");
            const m = await api.sendMessage(
              Number(partner.telegramId),
              endText,
              {
                reply_markup: wipeChatKeyboard(user.id),
              },
            );
            await logChatMessage(
              partner.id,
              user.id,
              partner.telegramId,
              m.message_id,
            );
            await api.sendMessage(
              Number(partner.telegramId),
              "از منو دوباره می‌توانی وصل شوی.",
              { reply_markup: mainKeyboard() },
            );
          } catch (err) {
            console.error("notify partner end-chat failed", partner.id, err);
          }
        }
      }
    }
    return;
  }

  if (user.state === "waiting") {
    await patchUser(user.id, {
      state: "idle",
      chatPartnerId: null,
      secureChat: false,
    });
  }
}

/** تعمیر وضعیت‌های گیرکرده چت */
export async function repairOrphanChats() {
  const chatting = await prisma.user.findMany({
    where: { state: "chatting" },
  });
  let fixed = 0;
  for (const u of chatting) {
    if (!u.chatPartnerId) {
      await patchUser(u.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      fixed++;
      continue;
    }
    const partner = await prisma.user.findUnique({
      where: { id: u.chatPartnerId },
    });
    if (
      !partner ||
      partner.state !== "chatting" ||
      partner.chatPartnerId !== u.id
    ) {
      await patchUser(u.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      if (partner?.chatPartnerId === u.id) {
        await patchUser(partner.id, {
          state: "idle",
          chatPartnerId: null,
          secureChat: false,
        });
      }
      fixed++;
    }
  }
  const stale = await prisma.user.findMany({
    where: {
      state: { not: "chatting" },
      chatPartnerId: { not: null },
    },
  });
  for (const u of stale) {
    await patchUser(u.id, { chatPartnerId: null, secureChat: false });
    fixed++;
  }
  return fixed;
}

export async function tryQuickMatch(ctx: Context, userId: number) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return;

  const genderFilter =
    me.lookingFor && me.lookingFor !== "any"
      ? { gender: me.lookingFor }
      : {};

  const partner = await prisma.user.findFirst({
    where: {
      state: "waiting",
      registered: true,
      id: { not: me.id },
      ...genderFilter,
    },
    orderBy: [{ boostUntil: "desc" }, { lastActiveAt: "asc" }],
  });

  if (!partner) {
    await patchUser(me.id, { state: "waiting", chatPartnerId: null });
    await ctx.reply(
      [
        "⚡ چت سریع",
        "",
        "وارد صف شدی…",
        "به محض پیدا شدن یک نفر، وصل‌ات می‌کنم.",
        "برای لغو: «لغو جستجو»",
      ].join("\n"),
      { reply_markup: waitingKeyboard() },
    );
    return;
  }

  await connectUsers(ctx.api, me.id, partner.id);
}

/** ارسال درخواست چت — بدون وصل مستقیم */
export async function sendChatRequest(
  api: Api,
  fromUserId: number,
  toUserId: number,
): Promise<"ok" | "busy" | "missing" | "demo" | "self" | "pending"> {
  const a = await prisma.user.findUnique({ where: { id: fromUserId } });
  const b = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!a || !b) return "missing";
  if (a.id === b.id) return "self";
  if (b.telegramId >= 9000000000n) return "demo";
  if (a.state === "chatting" || b.state === "chatting") return "busy";

  const existing = await prisma.chatRequest.findFirst({
    where: {
      fromUserId: a.id,
      toUserId: b.id,
      status: "pending",
    },
  });
  if (existing) return "pending";

  const req = await prisma.chatRequest.create({
    data: { fromUserId: a.id, toUserId: b.id, status: "pending" },
  });

  const fromName = a.displayName ?? "یک کاربر";
  const text = [
    "💬 درخواست چت ناشناس",
    "",
    `از طرف: ${fromName}${a.age ? ` (${a.age})` : ""}`,
    a.faceVerified ? "✅ احرازچهره شده" : "🕶 بدون احراز",
    "",
    "قبول می‌کنی یا رد؟",
  ].join("\n");

  try {
    await api.sendMessage(Number(b.telegramId), text, {
      reply_markup: chatRequestKeyboard(req.id),
    });
  } catch (err) {
    console.error("chat request notify failed", err);
    await prisma.chatRequest.update({
      where: { id: req.id },
      data: { status: "cancelled" },
    });
    return "busy";
  }
  return "ok";
}

export async function respondChatRequest(
  api: Api,
  requestId: number,
  toUserId: number,
  accept: boolean,
): Promise<"ok" | "missing" | "gone" | "busy" | "demo"> {
  const req = await prisma.chatRequest.findUnique({ where: { id: requestId } });
  if (!req || req.toUserId !== toUserId) return "missing";
  if (req.status !== "pending") return "gone";

  if (!accept) {
    await prisma.chatRequest.update({
      where: { id: req.id },
      data: { status: "rejected" },
    });
    const from = await prisma.user.findUnique({ where: { id: req.fromUserId } });
    if (from && from.telegramId < 9000000000n) {
      await api
        .sendMessage(
          Number(from.telegramId),
          "❌ درخواست چت‌ات رد شد.",
          { reply_markup: mainKeyboard() },
        )
        .catch(() => undefined);
    }
    return "ok";
  }

  await prisma.chatRequest.update({
    where: { id: req.id },
    data: { status: "accepted" },
  });
  const result = await connectUsers(api, req.fromUserId, req.toUserId);
  return result;
}

export async function connectUsers(
  api: Api,
  aId: number,
  bId: number,
): Promise<"ok" | "busy" | "missing" | "demo"> {
  const a = await prisma.user.findUnique({ where: { id: aId } });
  const b = await prisma.user.findUnique({ where: { id: bId } });
  if (!a || !b) return "missing";
  if (b.telegramId >= 9000000000n || a.telegramId >= 9000000000n) return "demo";
  if (a.state === "chatting" || b.state === "chatting") return "busy";

  await leaveQueueOrChat(api, a, true);
  await leaveQueueOrChat(api, b, true);

  await patchUser(a.id, {
    state: "chatting",
    chatPartnerId: b.id,
    chatsCount: { increment: 1 },
    secureChat: false,
  });
  await patchUser(b.id, {
    state: "chatting",
    chatPartnerId: a.id,
    chatsCount: { increment: 1 },
    secureChat: false,
  });

  const msg = [
    "✅ وصل شدید!",
    "چت ناشناس است — هویت لو نمی‌رود.",
    "📷 می‌توانی عکس بفرستی.",
    "🔒 برای چت امن (عکس غیرقابل ذخیره) دکمه «چت امن» را بزن.",
    "قطع: «قطع چت» یا /end",
  ].join("\n");

  const ma = await api.sendMessage(Number(a.telegramId), msg, {
    reply_markup: chattingKeyboard(false),
  });
  const mb = await api.sendMessage(Number(b.telegramId), msg, {
    reply_markup: chattingKeyboard(false),
  });
  await logPairMessages({
    aUserId: a.id,
    bUserId: b.id,
    aChatId: a.telegramId,
    bChatId: b.telegramId,
    aMessageId: ma.message_id,
    bMessageId: mb.message_id,
  });
  return "ok";
}

export async function setSecureChat(
  api: Api,
  userId: number,
  enabled: boolean,
): Promise<boolean> {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.state !== "chatting" || !me.chatPartnerId) return false;
  const partner = await prisma.user.findUnique({
    where: { id: me.chatPartnerId },
  });
  if (!partner || partner.chatPartnerId !== me.id) return false;

  await patchUser(me.id, { secureChat: enabled });
  await patchUser(partner.id, { secureChat: enabled });

  const text = enabled
    ? "🔒 چت امن فعال شد.\nعکس‌های بعدی قابل ذخیره/فوروارد نیستند."
    : "🔓 چت امن خاموش شد.";

  const ma = await api.sendMessage(Number(me.telegramId), text, {
    reply_markup: chattingKeyboard(enabled),
  });
  const mb = await api.sendMessage(Number(partner.telegramId), text, {
    reply_markup: chattingKeyboard(enabled),
  });
  await logPairMessages({
    aUserId: me.id,
    bUserId: partner.id,
    aChatId: me.telegramId,
    bChatId: partner.telegramId,
    aMessageId: ma.message_id,
    bMessageId: mb.message_id,
  });
  return true;
}

/** پیشنهاد پاک‌سازی برای کسی که خودش قطع کرده */
export async function offerWipeAfterEnd(
  api: Api,
  userId: number,
  partnerUserId: number,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.telegramId >= 9000000000n) return;
  const text = [
    "چت قطع شد.",
    "",
    "می‌توانی پیام‌های این گفتگو را پاک کنی.",
    "⚠️ فقط پیام‌های ربات در این چت پاک می‌شوند.",
    "پاک‌کردن کامل تاریخچه تلگرام: Clear history روی چت.",
  ].join("\n");
  const m = await api.sendMessage(Number(user.telegramId), text, {
    reply_markup: wipeChatKeyboard(partnerUserId),
  });
  await logChatMessage(user.id, partnerUserId, user.telegramId, m.message_id);
}

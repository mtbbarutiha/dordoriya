import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../db/prisma.js";
import { patchUser } from "../db/users.js";
import { haversineKm } from "../lib/geo.js";
import {
  chattingKeyboard,
  mainKeyboard,
  waitingKeyboard,
} from "../keyboards/main.js";
import { logPairMessages, logChatMessage } from "./chatLog.js";

async function cancelPendingFromUser(userId: number, exceptId?: number) {
  await prisma.chatRequest.updateMany({
    where: {
      fromUserId: userId,
      status: "pending",
      ...(exceptId != null ? { id: { not: exceptId } } : {}),
    },
    data: { status: "cancelled" },
  });
}

export function chatRequestKeyboard(requestId: number) {
  return new InlineKeyboard()
    .text("✅ قبول چت", `chatreq:ok:${requestId}`)
    .text("❌ رد", `chatreq:no:${requestId}`);
}

export function wipeChatKeyboard(partnerUserId: number) {
  return new InlineKeyboard().text(
    "🗑 پاک کردن کامل گفتگو (هر دو طرف)",
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
              "می‌توانی کل گفتگو (متن/عکس/ویدیو) را برای هر دو طرف پاک کنی.",
              "اگر چیزی باقی ماند: Clear history روی این چت.",
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
    await cancelPendingFromUser(user.id);
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
  if (me.state === "chatting") {
    await ctx.reply("الان در چت هستی. اول قطع کن.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  // لغو درخواست‌های قبلی باز
  await prisma.chatRequest.updateMany({
    where: { fromUserId: me.id, status: "pending" },
    data: { status: "cancelled" },
  });

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: me.id },
      registered: true,
      isActive: true,
      deletedAt: null,
      state: { not: "chatting" },
      telegramId: { lt: 9000000000n },
    },
  });

  const scored = candidates
    .map((u) => ({ u, score: quickMatchScore(me, u) }))
    .sort((a, b) => b.score - a.score || b.u.lastActiveAt.getTime() - a.u.lastActiveAt.getTime());

  // همه فعال‌ها، با سقف ایمنی برای محدودیت تلگرام
  const MAX = 80;
  const targets = scored.slice(0, MAX).map((x) => x.u);

  if (!targets.length) {
    await patchUser(me.id, { state: "waiting", chatPartnerId: null });
    await ctx.reply(
      [
        "⚡ چت سریع",
        "",
        "فعلاً کاربر فعالی برای ارسال درخواست نیست.",
        "در صف ماندی — به‌محض آنلاین شدن دیگران دوباره امتحان کن.",
        "لغو: «لغو جستجو»",
      ].join("\n"),
      { reply_markup: waitingKeyboard() },
    );
    return;
  }

  await patchUser(me.id, { state: "waiting", chatPartnerId: null });
  await ctx.reply(
    [
      "⚡ چت سریع",
      "",
      `درخواست چت به ${targets.length} کاربر فعال ارسال شد.`,
      "اولویت: آنلاین‌ها → لوکیشن/کشور/استان/شهر نزدیک‌تر",
      "",
      "به‌محض قبول یکی، وصل می‌شوی.",
      "لغو: «لغو جستجو»",
    ].join("\n"),
    { reply_markup: waitingKeyboard() },
  );

  let sent = 0;
  for (const target of targets) {
    const result = await sendChatRequest(ctx.api, me.id, target.id, {
      source: "quick",
      silentPending: true,
    });
    if (result === "ok") sent++;
    // کمی فاصله برای rate limit
    if (sent % 15 === 0) await sleep(350);
  }

  if (sent === 0) {
    await ctx.reply(
      "ارسال درخواست ممکن نشد. بعداً دوباره امتحان کن.",
      { reply_markup: mainKeyboard() },
    );
    await patchUser(me.id, { state: "idle" });
    return;
  }

  if (sent < targets.length) {
    await ctx.reply(`✅ ${sent} درخواست ارسال شد. منتظر قبول بمان…`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** امتیاز اولویت: آنلاین، لوکیشن، کشور، استان، شهر */
function quickMatchScore(
  me: {
    lookingFor: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  },
  u: {
    gender: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    lastActiveAt: Date;
    boostUntil: Date | null;
    faceVerified: boolean;
  },
): number {
  let score = 0;
  const mins = (Date.now() - u.lastActiveAt.getTime()) / 60_000;
  if (mins <= 5) score += 12_000;
  else if (mins <= 15) score += 10_000;
  else if (mins <= 60) score += 7_000;
  else if (mins <= 60 * 24) score += 3_000;
  else score += Math.max(0, 1000 - mins);

  if (u.boostUntil && u.boostUntil.getTime() > Date.now()) score += 800;
  if (u.faceVerified) score += 150;

  if (me.lookingFor && me.lookingFor !== "any" && u.gender === me.lookingFor) {
    score += 500;
  }

  if (me.country && u.country && me.country === u.country) score += 400;
  if (me.province && u.province && me.province === u.province) score += 700;
  if (me.city && u.city && me.city === u.city) score += 900;

  if (
    me.latitude != null &&
    me.longitude != null &&
    u.latitude != null &&
    u.longitude != null
  ) {
    const km = haversineKm(me.latitude, me.longitude, u.latitude, u.longitude);
    if (km <= 5) score += 2_000;
    else if (km <= 20) score += 1_400;
    else if (km <= 50) score += 900;
    else if (km <= 100) score += 500;
    else score += Math.max(0, 300 - Math.floor(km / 10));
  }

  return score;
}

export type SendChatRequestOptions = {
  source?: "direct" | "quick" | string;
  /** اگر درخواست pending از قبل باشد، بدون اثر جانبی فقط pending برمی‌گرداند */
  silentPending?: boolean;
};

/** ارسال درخواست چت — بدون وصل مستقیم */
export async function sendChatRequest(
  api: Api,
  fromUserId: number,
  toUserId: number,
  options?: SendChatRequestOptions,
): Promise<"ok" | "busy" | "missing" | "demo" | "self" | "pending"> {
  const source = options?.source ?? "direct";
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
    data: {
      fromUserId: a.id,
      toUserId: b.id,
      status: "pending",
      source,
    },
  });

  const fromName = a.displayName ?? "یک کاربر";
  const title =
    source === "quick" ? "⚡ درخواست چت سریع" : "💬 درخواست چت ناشناس";
  const text = [
    title,
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
    // برای چت سریع به ازای هر رد نوتیف نده (اسپم)
    if (req.source !== "quick") {
      const from = await prisma.user.findUnique({
        where: { id: req.fromUserId },
      });
      if (from && from.telegramId < 9000000000n) {
        await api
          .sendMessage(
            Number(from.telegramId),
            "❌ درخواست چت‌ات رد شد.",
            { reply_markup: mainKeyboard() },
          )
          .catch(() => undefined);
      }
    }
    return "ok";
  }

  await prisma.chatRequest.update({
    where: { id: req.id },
    data: { status: "accepted" },
  });
  // بقیه درخواست‌های باز همین فرستنده لغو شود
  await cancelPendingFromUser(req.fromUserId, req.id);
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

  // لغو درخواست‌های pending باقی‌مانده از هر دو طرف
  await cancelPendingFromUser(a.id);
  await cancelPendingFromUser(b.id);

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
    "می‌توانی کل گفتگو را برای هر دو طرف پاک کنی (متن/عکس/ویدیو).",
    "اگر چیزی باقی ماند: Clear history روی این چت.",
  ].join("\n");
  const m = await api.sendMessage(Number(user.telegramId), text, {
    reply_markup: wipeChatKeyboard(partnerUserId),
  });
  await logChatMessage(user.id, partnerUserId, user.telegramId, m.message_id);
}

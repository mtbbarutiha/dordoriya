import { prisma } from "../db/prisma.js";
import { setState } from "../db/users.js";
import type { Api, Context } from "grammy";
import { chattingKeyboard, mainKeyboard, waitingKeyboard } from "../keyboards/main.js";

export async function leaveQueueOrChat(
  api: Api,
  user: { id: number; telegramId: bigint; state: string; chatPartnerId: number | null },
  notifyPartner = true,
) {
  if (user.state === "chatting" && user.chatPartnerId) {
    const partner = await prisma.user.findUnique({
      where: { id: user.chatPartnerId },
    });
    await setState(user.id, "idle", { chatPartnerId: null });
    if (partner) {
      await setState(partner.id, "idle", { chatPartnerId: null });
      if (notifyPartner) {
        await api.sendMessage(
          Number(partner.telegramId),
          "طرف مقابل چت رو قطع کرد.\nدوباره می‌تونی از منو وصل شی.",
          { reply_markup: mainKeyboard() },
        );
      }
    }
    return;
  }

  if (user.state === "waiting") {
    await setState(user.id, "idle", { chatPartnerId: null });
  }
}

export async function tryMatch(ctx: Context, userId: number) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return;

  const partner = await prisma.user.findFirst({
    where: {
      state: "waiting",
      id: { not: me.id },
    },
    orderBy: { lastActiveAt: "asc" },
  });

  if (!partner) {
    await setState(me.id, "waiting", { chatPartnerId: null });
    await ctx.reply(
      [
        "⚡ تونل شب",
        "",
        "وارد صف شدی…",
        "یه ناشناس پیدا بشه وصل‌ت می‌کنم.",
        "محترم باش؛ برای لغو: «لغو جستجو».",
      ].join("\n"),
      { reply_markup: waitingKeyboard() },
    );
    return;
  }

  await setState(me.id, "chatting", { chatPartnerId: partner.id });
  await setState(partner.id, "chatting", { chatPartnerId: me.id });

  const connected = [
    "✅ وصل شدی!",
    "الان ناشناس حرف بزن.",
    "برای قطع: /end یا دکمه قطع چت.",
  ].join("\n");

  await ctx.reply(connected, { reply_markup: chattingKeyboard() });
  await ctx.api.sendMessage(Number(partner.telegramId), connected, {
    reply_markup: chattingKeyboard(),
  });
}

function isDemoUser(telegramId: bigint): boolean {
  return telegramId >= 9000000000n;
}

export async function connectSpecific(
  api: Api,
  fromUserId: number,
  toUserId: number,
): Promise<"ok" | "busy" | "demo" | "missing"> {
  const me = await prisma.user.findUnique({ where: { id: fromUserId } });
  const other = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!me || !other) return "missing";

  if (isDemoUser(other.telegramId)) {
    await api.sendMessage(
      Number(me.telegramId),
      [
        "این پروفایل نمونه‌ست تا رادار شهری رو ببینی.",
        "برای چت واقعی، دوستت هم باید تو دودوریا لوکیشن بده.",
      ].join("\n"),
      { reply_markup: mainKeyboard() },
    );
    return "demo";
  }

  if (me.state === "chatting" || other.state === "chatting") {
    return "busy";
  }

  await leaveQueueOrChat(api, me, true);
  await leaveQueueOrChat(api, other, true);

  await setState(me.id, "chatting", { chatPartnerId: other.id });
  await setState(other.id, "chatting", { chatPartnerId: me.id });

  const msg = [
    "✅ وصل شدید (از نزدیکای شهر)",
    "چت ناشناسه — هویت لو نمی‌ره.",
    "قطع: /end",
  ].join("\n");

  await api.sendMessage(Number(me.telegramId), msg, {
    reply_markup: chattingKeyboard(),
  });
  await api.sendMessage(Number(other.telegramId), msg, {
    reply_markup: chattingKeyboard(),
  });
  return "ok";
}

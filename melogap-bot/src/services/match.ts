import type { Api, Context } from "grammy";
import { prisma } from "../db/prisma.js";
import { patchUser } from "../db/users.js";
import {
  chattingKeyboard,
  mainKeyboard,
  waitingKeyboard,
} from "../keyboards/main.js";

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
  if (user.state === "chatting" && user.chatPartnerId) {
    const partner = await prisma.user.findUnique({
      where: { id: user.chatPartnerId },
    });
    await patchUser(user.id, { state: "idle", chatPartnerId: null });
    if (partner) {
      await patchUser(partner.id, { state: "idle", chatPartnerId: null });
      if (notifyPartner) {
        await api.sendMessage(
          Number(partner.telegramId),
          "طرف مقابل چت را قطع کرد.\nاز منو دوباره می‌توانی وصل شوی.",
          { reply_markup: mainKeyboard() },
        );
      }
    }
    return;
  }
  if (user.state === "waiting") {
    await patchUser(user.id, { state: "idle", chatPartnerId: null });
  }
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

  await patchUser(me.id, {
    state: "chatting",
    chatPartnerId: partner.id,
    chatsCount: { increment: 1 },
  });
  await patchUser(partner.id, {
    state: "chatting",
    chatPartnerId: me.id,
    chatsCount: { increment: 1 },
  });

  const msg = [
    "✅ وصل شدید!",
    "چت ناشناس است — هویت لو نمی‌رود.",
    "برای قطع: دکمه «قطع چت» یا /end",
  ].join("\n");

  await ctx.reply(msg, { reply_markup: chattingKeyboard() });
  await ctx.api.sendMessage(Number(partner.telegramId), msg, {
    reply_markup: chattingKeyboard(),
  });
}

export async function connectUsers(
  api: Api,
  aId: number,
  bId: number,
): Promise<"ok" | "busy" | "missing" | "demo"> {
  const a = await prisma.user.findUnique({ where: { id: aId } });
  const b = await prisma.user.findUnique({ where: { id: bId } });
  if (!a || !b) return "missing";
  if (b.telegramId >= 9000000000n) return "demo";
  if (a.state === "chatting" || b.state === "chatting") return "busy";

  await leaveQueueOrChat(api, a, true);
  await leaveQueueOrChat(api, b, true);

  await patchUser(a.id, {
    state: "chatting",
    chatPartnerId: b.id,
    chatsCount: { increment: 1 },
  });
  await patchUser(b.id, {
    state: "chatting",
    chatPartnerId: a.id,
    chatsCount: { increment: 1 },
  });

  const msg = [
    "✅ وصل شدید!",
    "چت ناشناس است.",
    "قطع: /end",
  ].join("\n");
  await api.sendMessage(Number(a.telegramId), msg, {
    reply_markup: chattingKeyboard(),
  });
  await api.sendMessage(Number(b.telegramId), msg, {
    reply_markup: chattingKeyboard(),
  });
  return "ok";
}

import { Composer } from "grammy";
import { requireRegistered } from "../services/register.js";
import { mainKeyboard, BTN } from "../keyboards/main.js";
import { sendProfileCard } from "../services/profile.js";
import { nextExploreProfile } from "../services/explore.js";
import { tryQuickMatch } from "../services/match.js";
import { patchUser, findByTelegram } from "../db/users.js";
import { formatNum, REFERRAL_BONUS } from "../data/packages.js";
import { diamondPackagesKeyboard } from "../keyboards/main.js";
import { prisma } from "../db/prisma.js";

export const commandsHandler = new Composer();

/** منوی اصلی — کیبورد پایین + راهنما */
export async function showMainMenu(ctx: {
  reply: (t: string, extra?: object) => Promise<unknown>;
  from?: { id: number } | undefined;
}) {
  await ctx.reply(
    [
      "📋 منوی اصلی دوردوریا",
      "",
      "از دکمه‌های پایین یا منوی ≡ کنار کادر پیام استفاده کن:",
      "",
      `• ${BTN.PROFILE}`,
      `• ${BTN.EXPLORE}`,
      `• ${BTN.ANON}`,
      `• ${BTN.QUICK_CHAT}`,
      `• ${BTN.BOOST} / ${BTN.DIAMONDS} / ${BTN.PRO}`,
      `• ${BTN.MORE} / ${BTN.STATS}`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
}

commandsHandler.command("menu", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  await showMainMenu(ctx);
});

commandsHandler.command("profile", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  await sendProfileCard(ctx, user.id);
});

commandsHandler.command("explore", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.state === "chatting") {
    await ctx.reply("اول چت فعلی را قطع کن (/end).");
    return;
  }
  await patchUser(user.id, { state: "explore" });
  await nextExploreProfile(ctx, user.id);
});

commandsHandler.command("chat", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.state === "chatting") {
    await ctx.reply("الان در چت هستی. اول قطع کن.");
    return;
  }
  await tryQuickMatch(ctx, user.id);
});

commandsHandler.command("anon", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=anon_${user.anonCode}`;
  await ctx.reply(
    [
      "🕵️ پیام ناشناس",
      "",
      "لینک شخصی تو:",
      link,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

commandsHandler.command("diamonds", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  await ctx.reply(
    [
      "🪙 سکه‌ها",
      "",
      `موجودی: ${formatNum(user.diamonds)} سکه`,
      "",
      "یکی از بسته‌ها را انتخاب کن:",
    ].join("\n"),
    { reply_markup: diamondPackagesKeyboard() },
  );
});

commandsHandler.command("stats", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const totalUsers = await prisma.user.count({ where: { registered: true } });
  await ctx.reply(
    [
      "📊 آمار",
      "",
      `👁 بازدید: ${formatNum(user.viewsCount)}`,
      `❤️ لایک: ${formatNum(user.likesCount)}`,
      `💬 چت: ${formatNum(user.chatsCount)}`,
      `🪙 سکه: ${formatNum(user.diamonds)}`,
      "",
      `کاربران فعال: ${formatNum(totalUsers)}`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

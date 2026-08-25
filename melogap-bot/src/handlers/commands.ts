import { Composer, InlineKeyboard } from "grammy";
import { requireRegistered } from "../services/register.js";
import {
  mainKeyboard,
  BTN,
  diamondPackagesKeyboard,
  searchPanelKeyboard,
} from "../keyboards/main.js";
import { sendProfileCard } from "../services/profile.js";
import { tryQuickMatch } from "../services/match.js";
import { patchUser, ensureUserCode } from "../db/users.js";
import { formatNum, BOOST_COST, BOOST_HOURS } from "../data/packages.js";
import { prisma } from "../db/prisma.js";
import { showProfileByUserCode } from "../services/explore.js";

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
      "از دکمه‌های پایین استفاده کن — شبیه ملوگپ:",
      "",
      `• ${BTN.QUICK_CHAT}`,
      `• ${BTN.NEARBY} / ${BTN.SEARCH}`,
      `• ${BTN.GUIDE} / ${BTN.PROFILE} / ${BTN.DIAMONDS}`,
      `• ${BTN.REFERRAL}`,
      `• ${BTN.ANON_LINK}`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
}

commandsHandler.command("menu", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  await showMainMenu(ctx);
});

/** /user_XXXX — باز کردن پروفایل از لیست سرچ */
commandsHandler.hears(/^\/user_([A-Za-z0-9]+)/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const code = ctx.match[1]!;
  await showProfileByUserCode(ctx, user.id, code);
});

commandsHandler.command("profile", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (!user.userCode) await ensureUserCode(user.id, user.userCode);
  await sendProfileCard(ctx, user.id);
});

commandsHandler.command("explore", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.state === "chatting") {
    await ctx.reply("اول چت فعلی را قطع کن (/end).");
    return;
  }
  await ctx.reply("🔍 جستجو کاربران — یک گزینه را انتخاب کن:", {
    reply_markup: searchPanelKeyboard(),
  });
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
  await ctx.reply(["🎭 لینک ناشناس من", "", link].join("\n"), {
    reply_markup: mainKeyboard(),
  });
});

commandsHandler.command("diamonds", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  await ctx.reply(
    [
      "💰 سکه‌ها",
      "",
      `موجودی: ${formatNum(user.diamonds)} سکه`,
      "",
      "یکی از بسته‌ها را انتخاب کن:",
    ].join("\n"),
    { reply_markup: diamondPackagesKeyboard() },
  );
});

commandsHandler.command("boost", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.boostUntil && user.boostUntil > new Date()) {
    await ctx.reply(
      `شتاب‌دهی فعال تا ${user.boostUntil.toLocaleString("fa-IR")}`,
      { reply_markup: mainKeyboard() },
    );
    return;
  }
  if (user.diamonds < BOOST_COST) {
    await ctx.reply(`سکه کافی نیست. نیاز: ${formatNum(BOOST_COST)}`, {
      reply_markup: mainKeyboard(),
    });
    return;
  }
  const until = new Date(Date.now() + BOOST_HOURS * 3600_000);
  await patchUser(user.id, {
    diamonds: { decrement: BOOST_COST },
    boostUntil: until,
  });
  await ctx.reply(`🚀 شتاب‌دهی فعال شد تا ${until.toLocaleString("fa-IR")}`, {
    reply_markup: mainKeyboard(),
  });
});

commandsHandler.command("pro", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.isPro) {
    await ctx.reply("پرو فعال است 🅿️", { reply_markup: mainKeyboard() });
    return;
  }
  const cost = 200;
  await ctx.reply(
    `🅿️ پرو — هزینه ${formatNum(cost)} سکه\nموجودی: ${formatNum(user.diamonds)}`,
    {
      reply_markup: new InlineKeyboard().text(
        `فعال‌سازی (${formatNum(cost)}💰)`,
        "pro:buy",
      ),
    },
  );
});

commandsHandler.command("stats", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const totalUsers = await prisma.user.count({ where: { registered: true } });
  await ctx.reply(
    [
      "📊 آمار",
      `👁 بازدید: ${formatNum(user.viewsCount)}`,
      `❤️ لایک: ${formatNum(user.likesCount)}`,
      `💬 چت: ${formatNum(user.chatsCount)}`,
      `💰 سکه: ${formatNum(user.diamonds)}`,
      `کاربران فعال: ${formatNum(totalUsers)}`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

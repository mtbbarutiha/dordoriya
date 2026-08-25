import { Composer } from "grammy";
import { prisma } from "../db/prisma.js";
import { BTN, mainKeyboard } from "../keyboards/main.js";

export const menuHandler = new Composer();

/** متن دکمه جدید + دکمه‌های قدیمی تا کیبورد قبلی هم جواب بده */
const CONNECT = [BTN.CONNECT, "به یه ناشناس وصلم کن! 🙈"] as const;
const NEARBY = [BTN.NEARBY, "افراد نزدیک 📍🛰️"] as const;
const SEARCH = [BTN.SEARCH, "جستجو کاربران 🔍🗨️"] as const;
const GUIDE = [BTN.GUIDE, "راهنما 🤔"] as const;
const PROFILE = [BTN.PROFILE, "پروفایل 👤"] as const;
const COINS = [BTN.COINS, "سکه 💰"] as const;
const REFERRAL = [
  BTN.REFERRAL,
  "معرفی به دوستان (سکه رایگان) 🔗",
] as const;
const ANON_LINK = [BTN.ANON_LINK, "لینک ناشناس من 🎭"] as const;

menuHandler.hears([...CONNECT], async (ctx) => {
  await ctx.reply(
    [
      "⚡ تونل شب",
      "",
      "داری وارد صف می‌شی…",
      "یه نفر اون طرف منتظره. محترم باش، آزاد حرف بزن.",
      "",
      "برای قطع بعد از اتصال: /end",
      "",
      "مچینگ واقعی در مرحله بعد فعال می‌شه — فعلاً صف آماده‌سازی‌ست.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears([...NEARBY], async (ctx) => {
  await ctx.reply(
    [
      "📍 رادار شهری",
      "",
      "نزدیکای شهرت رو پیدا کن.",
      "این بخش به‌زودی با لوکیشن فعال می‌شه.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears([...SEARCH], async (ctx) => {
  await ctx.reply(
    [
      "🎯 فیلتر هوشمند",
      "",
      "چت رو با معیارهایی که می‌خوای محدود کن.",
      "حالت انتخابی به‌زودی اینجاست.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears([...GUIDE], async (ctx) => {
  await ctx.reply(
    [
      "📖 چطور کار می‌کنه؟",
      "",
      "۱) بزن بریم ناشناس → چت رندوم در تونل شب",
      "۲) صندوق ناشناس → پیام از بیرون بدون لو رفتن اسم",
      "۳) دعوت کن → سکه رایگان",
      "",
      "قانون طلایی: توهین / اسپم = بلاک",
      "",
      "بقیه قابلیت‌ها مرحله‌به‌مرحله روشن می‌شن.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears([...PROFILE], async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  if (!user) {
    await ctx.reply("اول /start بزن تا وارد دودوریا شی.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  await ctx.reply(
    [
      "🪪 هویت من",
      "",
      "این هویت فعلیت داخل دودوریاست — نه تلگرامت.",
      "",
      `نام: ${user.firstName ?? "—"}`,
      `یوزرنیم: ${user.username ? `@${user.username}` : "—"}`,
      `سکه: ${user.coins}`,
      `کد دعوت: ${user.referralCode}`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears([...COINS], async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  await ctx.reply(
    [
      "🪙 کیف سکه",
      "",
      "سکه = بنزین چت‌های خاص‌تر.",
      `موجودی‌ات: ${user?.coins ?? 0}`,
      "",
      "پکیج بخر یا با دعوت دوست پر کن.",
      "خرید مستقیم به‌زودی فعال می‌شه.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears([...REFERRAL], async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  if (!user) {
    await ctx.reply("اول /start بزن تا وارد دودوریا شی.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=ref_${user.referralCode}`;

  await ctx.reply(
    [
      "🎁 دعوت کن، سکه بگیر",
      "",
      "لینکت رو بده به رفیقات.",
      "هر ورود واقعی = سکه برای تو.",
      "(پاداش سکه به‌زودی روشن می‌شه)",
      "",
      "لینک دعوتت:",
      link,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears([...ANON_LINK], async (ctx) => {
  await ctx.reply(
    [
      "🎭 صندوق ناشناس من",
      "",
      "این لینک رو بذار توی بایو / استوری.",
      "بقیه بدون دیدن اسمت برات پیام می‌فرستن.",
      "",
      "لینک شخصی‌ات در مرحله بعد ساخته می‌شه.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

/** هر پیام متنی ناشناخته → منوی جدید */
menuHandler.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  await ctx.reply(
    "منوی دودوریا اینجاست 👇\nیکی از دکمه‌ها رو بزن یا /start بزن.",
    { reply_markup: mainKeyboard() },
  );
});

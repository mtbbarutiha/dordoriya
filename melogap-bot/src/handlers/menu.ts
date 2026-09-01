import { Composer } from "grammy";
import { prisma } from "../db/prisma.js";
import { BTN, mainKeyboard } from "../keyboards/main.js";

export const menuHandler = new Composer();

const COMING_SOON = "این بخش به‌زودی فعال می‌شه ⏳";

menuHandler.hears(BTN.CONNECT, async (ctx) => {
  await ctx.reply(
    "اتصال به ناشناس در مرحله بعد اضافه می‌شه.\nفعلاً منتظر بمون 🙈",
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.NEARBY, async (ctx) => {
  await ctx.reply(COMING_SOON, { reply_markup: mainKeyboard() });
});

menuHandler.hears(BTN.SEARCH, async (ctx) => {
  await ctx.reply(COMING_SOON, { reply_markup: mainKeyboard() });
});

menuHandler.hears(BTN.GUIDE, async (ctx) => {
  await ctx.reply(
    [
      "📖 راهنمای ربات",
      "",
      "• به یه ناشناس وصلم کن: چت تصادفی ناشناس",
      "• افراد نزدیک: پیدا کردن افراد نزدیکت",
      "• جستجو کاربران: جستجو بر اساس معیار",
      "• پروفایل: مشاهده و ویرایش اطلاعات",
      "• سکه: خرید و مدیریت سکه",
      "• معرفی به دوستان: لینک دعوت و سکه رایگان",
      "• لینک ناشناس من: دریافت پیام ناشناس از دیگران",
      "",
      "فعلاً فقط منوی اصلی آماده است؛ بقیه قابلیت‌ها مرحله‌به‌مرحله اضافه می‌شن.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.PROFILE, async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  if (!user) {
    await ctx.reply("اول /start بزن تا ثبت‌نام شی.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  await ctx.reply(
    [
      "👤 پروفایل تو",
      "",
      `نام: ${user.firstName ?? "—"}`,
      `یوزرنیم: ${user.username ? `@${user.username}` : "—"}`,
      `سکه: ${user.coins}`,
      `کد معرف: ${user.referralCode}`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.COINS, async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  await ctx.reply(
    `💰 موجودی سکه: ${user?.coins ?? 0}\n\nخرید سکه به‌زودی فعال می‌شه.`,
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.REFERRAL, async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  if (!user) {
    await ctx.reply("اول /start بزن تا ثبت‌نام شی.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=ref_${user.referralCode}`;

  await ctx.reply(
    [
      "🔗 معرفی به دوستان",
      "",
      "این لینک رو برای دوستات بفرست. وقتی با لینک تو وارد بشن، معرف‌شون می‌شی.",
      "(پاداش سکه در مرحله‌های بعدی فعال می‌شه)",
      "",
      link,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.ANON_LINK, async (ctx) => {
  await ctx.reply(
    "🎭 لینک ناشناس شخصی‌ات در مرحله بعد ساخته می‌شه.",
    { reply_markup: mainKeyboard() },
  );
});

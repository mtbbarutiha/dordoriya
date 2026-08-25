import { Composer } from "grammy";
import { getByTelegramId, setState } from "../db/users.js";
import {
  BTN,
  locationKeyboard,
  mainKeyboard,
  coinPackagesKeyboard,
  genderFilterKeyboard,
  profileGenderKeyboard,
} from "../keyboards/main.js";
import { formatCoins, REFERRAL_BONUS } from "../data/packages.js";
import { tryMatch, leaveQueueOrChat } from "../services/match.js";

export const menuHandler = new Composer();

async function requireUser(ctx: { from?: { id: number } | undefined }) {
  if (!ctx.from) return null;
  return getByTelegramId(ctx.from.id);
}

menuHandler.hears(
  [BTN.CONNECT, "به یه ناشناس وصلم کن! 🙈"],
  async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) {
      await ctx.reply("اول /start بزن.");
      return;
    }
    if (user.state === "chatting") {
      await ctx.reply("الان تو چتی. اول /end بزن.");
      return;
    }
    await tryMatch(ctx, user.id);
  },
);

menuHandler.hears([BTN.NEARBY, "افراد نزدیک 📍🛰️"], async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) {
    await ctx.reply("اول /start بزن.");
    return;
  }
  await setState(user.id, "await_location");
  await ctx.reply(
    [
      "📍 رادار شهری",
      "",
      "موقعیتت رو بفرست تا نزدیکات رو پیدا کنم.",
      "لوکیشن خام به بقیه نشون داده نمی‌شه — فقط فاصله تقریبی.",
      "",
      "دکمه «ارسال موقعیت» رو بزن 👇",
    ].join("\n"),
    { reply_markup: locationKeyboard() },
  );
});

menuHandler.hears([BTN.SEARCH, "جستجو کاربران 🔍🗨️"], async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) {
    await ctx.reply("اول /start بزن.");
    return;
  }
  await setState(user.id, "await_gender");
  await ctx.reply(
    [
      "🎯 فیلتر هوشمند",
      "",
      "می‌خوای با کدوم جنسیت وصل شی؟",
      "(بعد از انتخاب می‌ری توی صف تونل شب)",
    ].join("\n"),
    { reply_markup: genderFilterKeyboard() },
  );
});

menuHandler.hears([BTN.GUIDE, "راهنما 🤔"], async (ctx) => {
  await ctx.reply(
    [
      "📖 چطور کار می‌کنه؟",
      "",
      "۱) بزن بریم ناشناس → صف تونل شب و چت رندوم",
      "۲) نزدیکای شهر → ارسال لوکیشن و دیدن افراد اطراف",
      "۳) فیلتر هوشمند → انتخاب جنسیت برای مچ",
      "۴) صندوق ناشناس → لینک برای پیام ناشناس از بیرون",
      "۵) دعوت کن → سکه رایگان برای تو",
      "۶) کیف سکه → خرید پکیج (فعلاً حالت دمو/تأیید دستی)",
      "",
      "قطع چت: /end",
      "قانون طلایی: توهین / اسپم = بلاک",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears([BTN.PROFILE, "پروفایل 👤"], async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) {
    await ctx.reply("اول /start بزن.", { reply_markup: mainKeyboard() });
    return;
  }
  const genderLabel =
    user.gender === "female"
      ? "خانم"
      : user.gender === "male"
        ? "آقا"
        : "ثبت نشده";
  const loc = user.latitude
    ? `ثبت شده (${user.locationAt?.toLocaleString("fa-IR") ?? "—"})`
    : "ثبت نشده";

  await ctx.reply(
    [
      "🪪 هویت من",
      "",
      "این هویت داخل دودوریاست — نه تلگرامت.",
      "",
      `نام: ${user.firstName ?? "—"}`,
      `یوزرنیم: ${user.username ? `@${user.username}` : "—"}`,
      `جنسیت: ${genderLabel}`,
      `سکه: ${formatCoins(user.coins)}`,
      `لوکیشن: ${loc}`,
      `کد دعوت: ${user.referralCode}`,
      `کد صندوق: ${user.anonCode}`,
      "",
      "جنسیت رو از دکمه‌های زیر تنظیم کن:",
    ].join("\n"),
    { reply_markup: profileGenderKeyboard() },
  );
});

menuHandler.hears([BTN.COINS, "سکه 💰"], async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) {
    await ctx.reply("اول /start بزن.");
    return;
  }
  await ctx.reply(
    [
      "🪙 کیف سکه",
      "",
      `موجودی: ${formatCoins(user.coins)} سکه`,
      "",
      "سکه = بنزین قابلیت‌های خاص‌تر.",
      "یکی از پکیج‌ها رو انتخاب کن (شبیه ملوگپ / هایپرگپ):",
      "",
      "⚠️ درگاه واقعی هنوز وصل نیست؛ بعد از انتخاب لینک دمو می‌گیری و با «پرداخت کردم» سکه دمو شارژ می‌شه.",
    ].join("\n"),
    { reply_markup: coinPackagesKeyboard() },
  );
});

menuHandler.hears(
  [BTN.REFERRAL, "معرفی به دوستان (سکه رایگان) 🔗"],
  async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) {
      await ctx.reply("اول /start بزن.", { reply_markup: mainKeyboard() });
      return;
    }
    const me = await ctx.api.getMe();
    const link = `https://t.me/${me.username}?start=ref_${user.referralCode}`;
    await ctx.reply(
      [
        "🎁 دعوت کن، سکه بگیر",
        "",
        `هر دوست جدید با لینک تو: +${REFERRAL_BONUS} سکه برای تو`,
        "به علاوه ۲۰ سکه هدیه ورود برای خودش.",
        "",
        "لینک دعوتت:",
        link,
      ].join("\n"),
      { reply_markup: mainKeyboard() },
    );
  },
);

menuHandler.hears([BTN.ANON_LINK, "لینک ناشناس من 🎭"], async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) {
    await ctx.reply("اول /start بزن.", { reply_markup: mainKeyboard() });
    return;
  }
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=anon_${user.anonCode}`;
  await ctx.reply(
    [
      "🎭 صندوق ناشناس من",
      "",
      "این لینک رو بذار توی بایو / استوری.",
      "بقیه بدون دیدن اسمت برات پیام می‌فرستن.",
      "",
      link,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.CANCEL_WAIT, async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) return;
  await leaveQueueOrChat(ctx.api, user, false);
  await setState(user.id, "idle");
  await ctx.reply("جستجو لغو شد.", { reply_markup: mainKeyboard() });
});

menuHandler.hears(BTN.END_CHAT, async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) return;
  if (user.state !== "chatting") {
    await ctx.reply("الان تو چت نیستی.", { reply_markup: mainKeyboard() });
    return;
  }
  await leaveQueueOrChat(ctx.api, user, true);
  await ctx.reply("چت قطع شد.", { reply_markup: mainKeyboard() });
});

menuHandler.hears(BTN.BACK, async (ctx) => {
  const user = await requireUser(ctx);
  if (user && user.state !== "chatting") {
    await setState(user.id, "idle", { pendingAnonTo: null });
  }
  await ctx.reply("برگشتی به منوی اصلی.", { reply_markup: mainKeyboard() });
});

menuHandler.hears(BTN.SEND_LOCATION, async (ctx) => {
  await ctx.reply("از دکمه تلگرام، موقعیتت رو Share Location کن 📍", {
    reply_markup: locationKeyboard(),
  });
});

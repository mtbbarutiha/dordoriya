import { Composer, InlineKeyboard } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import {
  BTN,
  mainKeyboard,
  diamondPackagesKeyboard,
  moreKeyboard,
  profileEditKeyboard,
  lookingForKeyboard,
  locationKeyboard,
  cancelKeyboard,
} from "../keyboards/main.js";
import {
  formatNum,
  genderLabel,
  BOOST_COST,
  BOOST_HOURS,
  REFERRAL_BONUS,
} from "../data/packages.js";
import { tryQuickMatch, leaveQueueOrChat } from "../services/match.js";
import { nextExploreProfile } from "../services/explore.js";
import { prisma } from "../db/prisma.js";

export const menuHandler = new Composer();

menuHandler.hears(BTN.PROFILE, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;

  const boosted =
    user.boostUntil && user.boostUntil > new Date()
      ? `فعال تا ${user.boostUntil.toLocaleString("fa-IR")}`
      : "غیرفعال";

  const interest =
    user.lookingFor === "any"
      ? "همه"
      : genderLabel(user.lookingFor);

  await ctx.reply(
    [
      "👤 پروفایل من",
      "",
      `نام: ${user.displayName ?? "—"}`,
      `جنسیت: ${genderLabel(user.gender)}`,
      `سن: ${user.age ?? "—"}`,
      `علاقه: ${interest}`,
      user.bio ? `بیو: ${user.bio}` : "بیو: —",
      `الماس: ${formatNum(user.diamonds)} 💎`,
      `شتاب‌دهی: ${boosted}`,
      `پرو: ${user.isPro ? "فعال 🅿️" : "غیرفعال"}`,
      "",
      "برای ویرایش از دکمه زیر استفاده کن:",
    ].join("\n"),
    { reply_markup: profileEditKeyboard() },
  );
});

menuHandler.hears(BTN.EXPLORE, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.state === "chatting") {
    await ctx.reply("اول چت فعلی را قطع کن (/end).");
    return;
  }
  await patchUser(user.id, { state: "explore" });
  await nextExploreProfile(ctx, user.id);
});

menuHandler.hears(BTN.ANON, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=anon_${user.anonCode}`;
  await ctx.reply(
    [
      "🕵️‍♂️ پیام ناشناس",
      "",
      "لینک شخصی خودت را بگذار در استوری یا بیو تا بقیه برایت ناشناس پیام بفرستند:",
      "",
      link,
      "",
      "اگر لینک کس دیگری را داری، همان را در تلگرام باز کن و پیام بفرست.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.QUICK_CHAT, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.state === "chatting") {
    await ctx.reply("الان در چت هستی. اول قطع کن.");
    return;
  }
  await tryQuickMatch(ctx, user.id);
});

menuHandler.hears(BTN.BOOST, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;

  if (user.boostUntil && user.boostUntil > new Date()) {
    await ctx.reply(
      `شتاب‌دهی‌ات هنوز فعال است تا ${user.boostUntil.toLocaleString("fa-IR")}`,
      { reply_markup: mainKeyboard() },
    );
    return;
  }

  if (user.diamonds < BOOST_COST) {
    await ctx.reply(
      [
        "🚀 شتاب‌دهی",
        "",
        `هزینه: ${formatNum(BOOST_COST)} الماس برای ${BOOST_HOURS} ساعت`,
        `موجودی تو: ${formatNum(user.diamonds)} الماس`,
        "",
        "الماس کافی نداری. از بخش «الماس‌ها» خرید کن.",
      ].join("\n"),
      { reply_markup: mainKeyboard() },
    );
    return;
  }

  const until = new Date(Date.now() + BOOST_HOURS * 3600_000);
  await patchUser(user.id, {
    diamonds: { decrement: BOOST_COST },
    boostUntil: until,
  });
  await ctx.reply(
    [
      "🚀 شتاب‌دهی فعال شد!",
      "",
      `تا ${until.toLocaleString("fa-IR")} در اکسپلور و چت سریع جلوتری.`,
      `${formatNum(BOOST_COST)} الماس کم شد.`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.DIAMONDS, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  await ctx.reply(
    [
      "💎 الماس‌ها",
      "",
      `موجودی: ${formatNum(user.diamonds)} الماس`,
      "",
      "یکی از بسته‌ها را انتخاب کن:",
      "(درگاه فعلاً دمو است؛ با «پرداخت کردم» شارژ می‌شود)",
    ].join("\n"),
    { reply_markup: diamondPackagesKeyboard() },
  );
});

menuHandler.hears(BTN.PRO, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;

  if (user.isPro) {
    await ctx.reply("اشتراک پرو تو فعال است 🅿️", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  const cost = 200;
  await ctx.reply(
    [
      "🅿️ اشتراک پرو",
      "",
      "مزایا:",
      "• دیده شدن بیشتر در اکسپلور",
      "• نشان پرو روی پروفایل",
      "• اولویت در چت سریع",
      "",
      `هزینه فعال‌سازی: ${formatNum(cost)} الماس`,
      `موجودی: ${formatNum(user.diamonds)}`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().text(
        `فعال‌سازی پرو (${formatNum(cost)}💎)`,
        "pro:buy",
      ),
    },
  );
});

menuHandler.hears(BTN.MORE, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  await ctx.reply("📋 بیشتر — یک گزینه را انتخاب کن:", {
    reply_markup: moreKeyboard(),
  });
});

menuHandler.hears(BTN.STATS, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const totalUsers = await prisma.user.count({ where: { registered: true } });
  await ctx.reply(
    [
      "📊 آمار",
      "",
      "آمار تو:",
      `• بازدید پروفایل: ${formatNum(user.viewsCount)}`,
      `• لایک دریافتی: ${formatNum(user.likesCount)}`,
      `• چت‌ها: ${formatNum(user.chatsCount)}`,
      `• الماس: ${formatNum(user.diamonds)}`,
      "",
      `کاربران فعال دوردوریا: ${formatNum(totalUsers)}`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.CANCEL_WAIT, async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  await leaveQueueOrChat(ctx.api, user, false);
  await patchUser(user.id, { state: "idle" });
  await ctx.reply("جستجو لغو شد.", { reply_markup: mainKeyboard() });
});

menuHandler.hears(BTN.END_CHAT, async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  if (user.state !== "chatting") {
    await ctx.reply("الان در چت نیستی.", { reply_markup: mainKeyboard() });
    return;
  }
  await leaveQueueOrChat(ctx.api, user, true);
  await ctx.reply("چت قطع شد.", { reply_markup: mainKeyboard() });
});

menuHandler.hears(BTN.BACK, async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (user && user.state !== "chatting") {
    await patchUser(user.id, { state: user.registered ? "idle" : user.state });
  }
  if (user?.registered) {
    await ctx.reply("منوی اصلی:", { reply_markup: mainKeyboard() });
  }
});

menuHandler.hears(BTN.SEND_LOCATION, async (ctx) => {
  await ctx.reply("از دکمه تلگرام موقعیت را Share کن 📍", {
    reply_markup: locationKeyboard(),
  });
});

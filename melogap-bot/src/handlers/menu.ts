import { Composer, InlineKeyboard } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import {
  BTN,
  mainKeyboard,
  diamondPackagesKeyboard,
  searchPanelKeyboard,
  locationKeyboard,
  chattingKeyboard,
} from "../keyboards/main.js";
import {
  formatNum,
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
  const { sendProfileCard } = await import("../services/profile.js");
  await sendProfileCard(ctx, user.id);
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

menuHandler.hears(BTN.NEARBY, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const hasSaved =
    user.latitude != null &&
    user.longitude != null &&
    Number.isFinite(user.latitude) &&
    Number.isFinite(user.longitude);

  if (hasSaved) {
    const { nearbyLocationChoiceKeyboard } = await import(
      "../services/nearbyUi.js"
    );
    await ctx.reply(
      [
        "📍 افراد نزدیک",
        "",
        "از کدام موقعیت استفاده کنم؟",
        "• لوکیشن ذخیره‌شده — همان GPS قبلی",
        "• لوکیشن فعلی — دوباره موقعیتت را می‌گیرم و ذخیره می‌کنم",
      ].join("\n"),
      { reply_markup: nearbyLocationChoiceKeyboard() },
    );
    return;
  }

  await patchUser(user.id, { state: "await_location" });
  await ctx.reply(
    [
      "📍 افراد نزدیک",
      "",
      "هنوز موقعیت ذخیره‌شده نداری.",
      "موقعیت فعلی‌ات را بفرست تا افراد اطراف را ببینی و ذخیره شود.",
      "مختصات دقیق به کسی نشان داده نمی‌شود.",
    ].join("\n"),
    { reply_markup: locationKeyboard() },
  );
});

menuHandler.hears(BTN.SEARCH, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.state === "chatting") {
    await ctx.reply("اول چت فعلی را قطع کن.");
    return;
  }
  await ctx.reply("🔍 جستجو کاربران — یک گزینه را انتخاب کن:", {
    reply_markup: searchPanelKeyboard(),
  });
});

menuHandler.hears(BTN.GUIDE, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const { fullGuideMessage } = await import("../data/guide.js");
  await ctx.reply(fullGuideMessage(), {
    reply_markup: mainKeyboard(),
  });
});

menuHandler.hears(BTN.DIAMONDS, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  await ctx.reply(
    [
      "💰 سکه‌ها",
      "",
      `موجودی: ${formatNum(user.diamonds)} سکه`,
      "",
      "یکی از بسته‌ها را انتخاب کن:",
      "(درگاه فعلاً دمو است؛ با «پرداخت کردم» شارژ می‌شود)",
    ].join("\n"),
    { reply_markup: diamondPackagesKeyboard() },
  );
});

menuHandler.hears(BTN.REFERRAL, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=${user.referralCode}`;
  await ctx.reply(
    [
      "🔗 معرفی به دوستان",
      "",
      `هر دعوت موفق: ${formatNum(REFERRAL_BONUS)} سکه رایگان برای تو 💰`,
      "",
      "لینک دعوتت:",
      link,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

menuHandler.hears(BTN.ANON_LINK, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=anon_${user.anonCode}`;
  await ctx.reply(
    [
      "🎭 لینک ناشناس من",
      "",
      "این لینک را در استوری یا بیو بگذار تا بقیه ناشناس برایت پیام بفرستند:",
      "",
      link,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

/** سازگاری دستورات قدیمی */
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
        `هزینه: ${formatNum(BOOST_COST)} سکه برای ${BOOST_HOURS} ساعت`,
        `موجودی: ${formatNum(user.diamonds)} سکه`,
        "سکه کافی نیست — از «سکه 💰» بخر.",
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
    `🚀 شتاب‌دهی فعال شد تا ${until.toLocaleString("fa-IR")}\n${formatNum(BOOST_COST)} سکه کم شد.`,
    { reply_markup: mainKeyboard() },
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
      "• دیده شدن بیشتر",
      "• نشان پرو",
      "• اولویت چت سریع",
      "",
      `هزینه: ${formatNum(cost)} سکه | موجودی: ${formatNum(user.diamonds)}`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().text(
        `✅ فعال‌سازی پرو (${formatNum(cost)}💰)`,
        "pro:buy",
      ),
    },
  );
});

menuHandler.hears(BTN.STATS, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const totalUsers = await prisma.user.count({ where: { registered: true } });
  await ctx.reply(
    [
      "📊 آمار",
      `• بازدید: ${formatNum(user.viewsCount)}`,
      `• لایک: ${formatNum(user.likesCount)}`,
      `• چت‌ها: ${formatNum(user.chatsCount)}`,
      `• سکه: ${formatNum(user.diamonds)}`,
      `کاربران دوردوریا: ${formatNum(totalUsers)}`,
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
  if (user.state !== "chatting" && !user.chatPartnerId) {
    await ctx.reply("الان در چت نیستی.", { reply_markup: mainKeyboard() });
    return;
  }
  const partnerId = user.chatPartnerId;
  await leaveQueueOrChat(ctx.api, user, true);
  await ctx.reply("چت قطع شد.", { reply_markup: mainKeyboard() });
  if (partnerId) {
    const { offerWipeAfterEnd } = await import("../services/match.js");
    await offerWipeAfterEnd(ctx.api, user.id, partnerId);
  }
});

menuHandler.hears(BTN.SECURE_CHAT_ON, async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user || user.state !== "chatting") {
    await ctx.reply("این دکمه فقط حین چت فعال است.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }
  const { setSecureChat } = await import("../services/match.js");
  await setSecureChat(ctx.api, user.id, true);
});

menuHandler.hears(BTN.SECURE_CHAT_OFF, async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user || user.state !== "chatting") {
    await ctx.reply("این دکمه فقط حین چت فعال است.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }
  const { setSecureChat } = await import("../services/match.js");
  await setSecureChat(ctx.api, user.id, false);
});

menuHandler.hears(BTN.BACK, async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  if (user.state === "chatting") {
    await ctx.reply("اول چت را قطع کن (/end).", {
      reply_markup: chattingKeyboard(user.secureChat),
    });
    return;
  }
  await leaveQueueOrChat(ctx.api, user, false);
  if (user.registered) {
    await patchUser(user.id, { state: "idle", chatPartnerId: null });
    await ctx.reply("منوی اصلی:", { reply_markup: mainKeyboard() });
  }
});

menuHandler.hears(BTN.SEND_LOCATION, async (ctx) => {
  await ctx.reply("از دکمه تلگرام موقعیت را Share کن 📍", {
    reply_markup: locationKeyboard(),
  });
});

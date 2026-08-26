import { Composer, InlineKeyboard } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import { prisma } from "../db/prisma.js";
import {
  mainKeyboard,
  paymentKeyboard,
  lookingReplyKeyboard,
  ageRangeReplyKeyboard,
  cancelKeyboard,
  locationKeyboard,
  editLocationKeyboard,
  giftDiamondsKeyboard,
} from "../keyboards/main.js";
import {
  createOrder,
  paymentUrl,
  markPaid,
  cancelOrder,
  findPackage,
} from "../services/diamonds.js";
import {
  formatNum,
  formatToman,
  REFERRAL_BONUS,
  LIKE_GIFT_DIAMONDS,
  GIFT_AMOUNTS,
} from "../data/packages.js";
import {
  nextExploreProfile,
  exploreOptsFromState,
  sendSearchList,
  sendViewAllList,
  exploreOptsFromKey,
} from "../services/explore.js";
import { sendChatRequest, respondChatRequest } from "../services/match.js";
import { saveLocation } from "../services/nearby.js";
import { publicPhotoWithBadge } from "../lib/faceBadgePhoto.js";

export const featuresHandler = new Composer();

featuresHandler.callbackQuery(/^open:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const code = ctx.match[1]!;
  await ctx.answerCallbackQuery();
  const { showProfileByUserCode } = await import("../services/explore.js");
  await showProfileByUserCode(ctx, user.id, code);
});

featuresHandler.callbackQuery("search:province", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (!user.province) {
    await ctx.answerCallbackQuery({ text: "استان ثبت نشده" });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏘 هم‌استانی‌های «${user.province}»:`);
  await sendSearchList(ctx, user.id, { sameProvince: true });
});

featuresHandler.callbackQuery("search:all", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await sendViewAllList(ctx, user.id, { ignoreLookingFor: true });
});

featuresHandler.callbackQuery(/^search:viewall:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const key = ctx.match[1]!;
  await ctx.answerCallbackQuery();
  await sendViewAllList(ctx, user.id, {
    ...exploreOptsFromKey(key),
    ignoreLookingFor: true,
  });
});

featuresHandler.callbackQuery(/^search:(next|skip):(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const key = ctx.match[2]!;
  await ctx.answerCallbackQuery();
  await nextExploreProfile(ctx, user.id, exploreOptsFromKey(key));
});

featuresHandler.callbackQuery("search:age", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (user.age == null) {
    await ctx.answerCallbackQuery({ text: "سن ثبت نشده" });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(`👤 هم‌سن‌های حدود ${user.age} سال:`);
  await sendSearchList(ctx, user.id, { sameAge: true });
});

featuresHandler.callbackQuery("search:new", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await sendSearchList(ctx, user.id, { newUsers: true });
});

featuresHandler.callbackQuery("search:nochats", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await sendSearchList(ctx, user.id, { noChats: true });
});

featuresHandler.callbackQuery("search:popular", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await sendSearchList(ctx, user.id, { popular: true });
});

featuresHandler.callbackQuery("search:gps", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await patchUser(user.id, { state: "await_location" });
  await ctx.reply(
    "📍 موقعیتت را بفرست تا افراد نزدیک را ببینی.",
    { reply_markup: locationKeyboard() },
  );
});

featuresHandler.callbackQuery("search:special", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "await_special" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "💌 وصل به مخاطب خاص",
      "",
      "لینک ناشناس یا کد ناشناس مخاطبت را بفرست.",
      "مثال: https://t.me/Dordoriya_bot?start=anon_xxxx",
      "یا فقط کد: xxxx",
    ].join("\n"),
    { reply_markup: cancelKeyboard() },
  );
});

featuresHandler.callbackQuery("search:advanced", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply("🔍 جستجو پیشرفته — علاقه را انتخاب کن:", {
    reply_markup: new InlineKeyboard()
      .text("👩 خانم", "search:adv:female")
      .text("👨 آقا", "search:adv:male")
      .row()
      .text("🎲 هردو", "search:adv:any"),
  });
});

featuresHandler.callbackQuery(/^search:adv:(female|male|any)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const looking = ctx.match[1]!;
  await patchUser(user.id, { lookingFor: looking });
  await ctx.answerCallbackQuery({ text: "فیلتر ذخیره شد" });
  await sendSearchList(ctx, user.id, {});
});

featuresHandler.callbackQuery("search:recent", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const recent = await prisma.interaction.findMany({
    where: { fromUserId: user.id, type: { in: ["like", "view"] } },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { toUser: true },
  });
  const seen = new Set<number>();
  const lines: string[] = [];
  for (const i of recent) {
    if (seen.has(i.toUserId) || i.toUser.deletedAt) continue;
    seen.add(i.toUserId);
    const n = i.toUser.displayName ?? "ناشناس";
    lines.push(`• ${n} (${i.type === "like" ? "❤️" : "👁"})`);
    if (lines.length >= 5) break;
  }
  if (!lines.length) {
    await ctx.reply("هنوز چت/بازدید اخیری نداری.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }
  await ctx.reply(
    ["👀 تعاملات اخیر تو:", "", ...lines, "", "برای دیدن پروفایل‌های جدید از جستجو استفاده کن."].join(
      "\n",
    ),
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery(/^buy:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const pkgId = ctx.match[1]!;
  const pkg = findPackage(pkgId);
  if (!pkg) {
    await ctx.answerCallbackQuery({ text: "بسته نامعتبر" });
    return;
  }
  const order = await createOrder(user.id, pkgId);
  if (!order) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  const url = paymentUrl(order.paymentCode);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "💳 فاکتور سکه",
      "",
      `بسته: ${pkg.label}`,
      `مبلغ: ${formatToman(pkg.toman)}`,
      `سکه: ${formatNum(pkg.diamonds)}`,
      "",
      "لینک پرداخت (دمو):",
      url,
      "",
      "بعد از پرداخت، «پرداخت کردم» را بزن.",
    ].join("\n"),
    { reply_markup: paymentKeyboard(order.id, url) },
  );
});

featuresHandler.callbackQuery(/^paid:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const orderId = Number(ctx.match[1]);
  const order = await markPaid(orderId, user.id);
  if (!order) {
    await ctx.answerCallbackQuery({ text: "سفارش پیدا نشد" });
    return;
  }
  const fresh = await findByTelegram(ctx.from.id);
  await ctx.answerCallbackQuery({ text: "شارژ شد" });
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  await ctx.reply(
    `✅ ${formatNum(order.diamonds)} سکه اضافه شد.\nموجودی: ${formatNum(fresh?.diamonds ?? 0)} 🪙`,
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery(/^cancel:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await cancelOrder(Number(ctx.match[1]), user.id);
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  await ctx.reply("سفارش لغو شد.", { reply_markup: mainKeyboard() });
});

featuresHandler.callbackQuery("pro:buy", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const cost = 200;
  if (user.diamonds < cost) {
    await ctx.answerCallbackQuery({ text: "سکه کافی نیست" });
    return;
  }
  await patchUser(user.id, {
    diamonds: { decrement: cost },
    isPro: true,
  });
  await ctx.answerCallbackQuery({ text: "پرو فعال شد" });
  await ctx.reply("🅿️ اشتراک پرو فعال شد!", {
    reply_markup: mainKeyboard(),
  });
});

featuresHandler.callbackQuery(/^exp:likes:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  await ctx.answerCallbackQuery({
    text: `❤️ ${formatNum(target?.likesCount ?? 0)} لایک`,
    show_alert: true,
  });
});

featuresHandler.callbackQuery(/^exp:like:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  if (targetId === user.id) {
    await ctx.answerCallbackQuery({ text: "خودت را نمی‌توانی لایک کنی" });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.deletedAt) {
    await ctx.answerCallbackQuery({ text: "کاربر پیدا نشد" });
    return;
  }

  const already = await prisma.interaction.findFirst({
    where: { type: "like", fromUserId: user.id, toUserId: targetId },
  });
  if (already) {
    await ctx.answerCallbackQuery({ text: "قبلاً لایک کردی" });
    return;
  }

  if (user.diamonds < LIKE_GIFT_DIAMONDS) {
    await ctx.answerCallbackQuery({ text: "سکه کافی نیست" });
    await ctx.reply(
      `برای لایک به ${formatNum(LIKE_GIFT_DIAMONDS)} سکه نیاز داری.\nموجودی: ${formatNum(user.diamonds)} 🪙`,
    );
    return;
  }

  await prisma.$transaction([
    prisma.interaction.create({
      data: { type: "like", fromUserId: user.id, toUserId: targetId },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { diamonds: { decrement: LIKE_GIFT_DIAMONDS } },
    }),
    prisma.user.update({
      where: { id: targetId },
      data: {
        likesCount: { increment: 1 },
        diamonds: { increment: LIKE_GIFT_DIAMONDS },
      },
    }),
  ]);

  const fromName = user.displayName ?? "یک کاربر";
  if (target.telegramId < 9000000000n) {
    await ctx.api
      .sendMessage(
        Number(target.telegramId),
        [
          "❤️ یک لایک جدید گرفتی!",
          `از طرف: ${fromName}`,
          `🎁 ${formatNum(LIKE_GIFT_DIAMONDS)} سکه به حسابت هدیه شد.`,
          "",
          "جزئیات در پروفایل ← تعاملات",
        ].join("\n"),
      )
      .catch(() => undefined);
  }

  await ctx.answerCallbackQuery({ text: "لایک + هدیه سکه ارسال شد" });
  await ctx.reply(
    `❤️ لایک ثبت شد.\n🎁 ${formatNum(LIKE_GIFT_DIAMONDS)} سکه برای «${target.displayName ?? "کاربر"}» هدیه شد.`,
  );
  await nextExploreProfile(ctx, user.id, {
    ...exploreOptsFromState(user.state),
  });
});

featuresHandler.callbackQuery(/^gift:menu:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    await ctx.answerCallbackQuery({ text: "کاربر نیست" });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      `🎁 هدیه سکه به «${target.displayName ?? "کاربر"}»`,
      "",
      `موجودی خودت: ${formatNum(user.diamonds)} 🪙`,
      "مقدار هدیه را انتخاب کن (از موجودی خودت کم می‌شود):",
    ].join("\n"),
    { reply_markup: giftDiamondsKeyboard(targetId) },
  );
});

featuresHandler.callbackQuery(/^gift:back:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await nextExploreProfile(ctx, user.id, {
    ...exploreOptsFromState(user.state),
  });
});

featuresHandler.callbackQuery(/^gift:send:(\d+):(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const amount = Number(ctx.match[2]);
  if (!(GIFT_AMOUNTS as readonly number[]).includes(amount)) {
    await ctx.answerCallbackQuery({ text: "مقدار نامعتبر" });
    return;
  }
  if (targetId === user.id) {
    await ctx.answerCallbackQuery({ text: "به خودت نمی‌شود هدیه داد" });
    return;
  }

  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!fresh || !target || target.deletedAt) {
    await ctx.answerCallbackQuery({ text: "کاربر پیدا نشد" });
    return;
  }
  if (fresh.diamonds < amount) {
    await ctx.answerCallbackQuery({ text: "سکه کافی نیست" });
    await ctx.reply(
      `موجودی‌ات کافی نیست.\nنیاز: ${formatNum(amount)} | موجودی: ${formatNum(fresh.diamonds)}`,
    );
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: fresh.id },
      data: { diamonds: { decrement: amount } },
    }),
    prisma.user.update({
      where: { id: targetId },
      data: { diamonds: { increment: amount } },
    }),
  ]);

  const fromName = fresh.displayName ?? "یک کاربر";
  if (target.telegramId < 9000000000n) {
    await ctx.api
      .sendMessage(
        Number(target.telegramId),
        [
          "🎁 یک هدیه سکه گرفتی!",
          `از طرف: ${fromName}`,
          `🪙 ${formatNum(amount)} سکه به حسابت اضافه شد.`,
        ].join("\n"),
      )
      .catch(() => undefined);
  }

  await ctx.answerCallbackQuery({ text: "هدیه ارسال شد" });
  await ctx.reply(
    `✅ ${formatNum(amount)} سکه برای «${target.displayName ?? "کاربر"}» ارسال شد.`,
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery(/^exp:chat:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const result = await sendChatRequest(ctx.api, user.id, targetId);
  if (result === "demo") {
    await ctx.answerCallbackQuery({ text: "پروفایل نمونه" });
    await ctx.reply("این پروفایل نمونه‌ است؛ با کاربر واقعی چت کن.");
    return;
  }
  if (result === "pending") {
    await ctx.answerCallbackQuery({ text: "درخواست قبلی هنوز باز است" });
    return;
  }
  if (result === "busy") {
    await ctx.answerCallbackQuery({ text: "الان مشغول است" });
    return;
  }
  if (result !== "ok") {
    await ctx.answerCallbackQuery({ text: "ارسال نشد" });
    return;
  }
  await ctx.answerCallbackQuery({ text: "درخواست ارسال شد" });
  await ctx.reply("💬 درخواست چت ارسال شد.\nمنتظر قبول یا رد طرف مقابل باش.");
});

featuresHandler.callbackQuery(/^chatreq:(ok|no):(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const accept = ctx.match[1] === "ok";
  const requestId = Number(ctx.match[2]);
  const result = await respondChatRequest(ctx.api, requestId, user.id, accept);
  if (result === "missing" || result === "gone") {
    await ctx.answerCallbackQuery({ text: "درخواست منقضی شده" });
    return;
  }
  if (result === "busy" || result === "demo") {
    await ctx.answerCallbackQuery({ text: "الان نمی‌شود وصل شد" });
    return;
  }
  await ctx.answerCallbackQuery({
    text: accept ? "قبول شد" : "رد شد",
  });
  if (!accept) {
    await ctx.reply("درخواست رد شد.", { reply_markup: mainKeyboard() });
  }
});

featuresHandler.callbackQuery(/^chat:wipe:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const partnerId = Number(ctx.match[1]);
  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  const { wipeChatBothSides } = await import("../services/chatLog.js");
  const { notifyWipeDone } = await import("../services/nearbyUi.js");
  const counts = await wipeChatBothSides(ctx.api, user.id, partnerId);
  await ctx.answerCallbackQuery({ text: "پاک شد برای هر دو طرف" });
  await ctx.reply(
    [
      "🗑 گفتگو برای هر دو طرف پاک شد.",
      `پیام‌های حذف‌شده از چت تو: ${counts.a}`,
      partner ? `پیام‌های حذف‌شده از چت طرف مقابل: ${counts.b}` : null,
      "",
      "متن، عکس و ویدیوهای ربات حذف شدند.",
      "اگر چیزی باقی ماند: Clear history روی این چت در تلگرام.",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: mainKeyboard() },
  );
  if (partner && partner.telegramId < 9000000000n) {
    await notifyWipeDone(ctx.api, partner.telegramId, counts.b);
  }
});

featuresHandler.callbackQuery("nearby:saved", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (user.latitude == null || user.longitude == null) {
    await ctx.answerCallbackQuery({ text: "لوکیشن ذخیره‌شده نیست" });
    await patchUser(user.id, { state: "await_location" });
    await ctx.reply("لوکیشن ذخیره‌شده نداری. موقعیت فعلی را بفرست:", {
      reply_markup: locationKeyboard(),
    });
    return;
  }
  await ctx.answerCallbackQuery({ text: "با لوکیشن ذخیره‌شده" });
  await patchUser(user.id, { state: "idle", lastActiveAt: new Date() });
  const { showNearbyResults } = await import("../services/nearbyUi.js");
  await showNearbyResults(ctx, user.id);
});

featuresHandler.callbackQuery("nearby:fresh", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: "لوکیشن فعلی" });
  await patchUser(user.id, { state: "await_location" });
  await ctx.reply(
    [
      "📡 لوکیشن فعلی",
      "",
      "دکمه ارسال موقعیت را بزن تا موقعیت تازه ذخیره شود",
      "و افراد نزدیک نشان داده شوند.",
    ].join("\n"),
    { reply_markup: locationKeyboard() },
  );
});

featuresHandler.callbackQuery(/^exp:(next|skip)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await nextExploreProfile(ctx, user.id, {
    ...exploreOptsFromState(user.state),
  });
});

featuresHandler.callbackQuery("more:province", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (!user.province) {
    await ctx.answerCallbackQuery({ text: "استان ثبت نشده" });
    await ctx.reply("اول در ثبت‌نام استان را مشخص کن.");
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(`🏘 هم‌استانی‌های «${user.province}»:`);
  await sendSearchList(ctx, user.id, { sameProvince: true });
});

featuresHandler.callbackQuery("more:guide", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "📖 راهنما",
      "",
      "• پروفایل من: مشاهده و ویرایش مشخصات",
      "• اکسپلور: دیدن افراد و لایک / چت",
      "• پیام ناشناس: لینک دریافت پیام مخفی",
      "• چت سریع: وصل تصادفی ناشناس",
      "• شتاب‌دهی: اولویت بیشتر با سکه",
      "• سکه‌ها: خرید اعتبار",
      "• اشتراک پرو: امکانات ویژه",
      "• آمار: بازدید و لایک و چت‌ها",
      "",
      "قطع چت: /end",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery("more:ref", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=ref_${user.referralCode}`;
  await ctx.reply(
    [
      "🎁 دعوت دوستان",
      "",
      `هر دعوت موفق: ${formatNum(REFERRAL_BONUS)} سکه برای تو`,
      "",
      link,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery("more:nearby", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await patchUser(user.id, { state: "await_location" });
  await ctx.reply(
    [
      "📍 نزدیک‌های شهر",
      "",
      "موقعیتت را بفرست تا افراد اطراف را ببینی.",
      "مختصات دقیق به کسی نشان داده نمی‌شود.",
    ].join("\n"),
    { reply_markup: locationKeyboard() },
  );
});

featuresHandler.callbackQuery("more:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("چه چیزی را می‌خواهی تغییر بدهی؟", {
    reply_markup: new InlineKeyboard()
      .text("نام", "edit:name")
      .text("سن", "edit:age")
      .row()
      .text("جنسیت", "edit:gender")
      .text("علاقه", "edit:looking")
      .row()
      .text("بیو", "edit:bio")
      .text("علاقه‌مندی‌ها", "edit:interests")
      .row()
      .text("📍 موقعیت", "edit:location")
      .text("عکس پروفایل", "edit:photo"),
  });
});

featuresHandler.callbackQuery("more:anonlink", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const me = await ctx.api.getMe();
  await ctx.reply(
    `🔗 لینک پیام ناشناس تو:\nhttps://t.me/${me.username}?start=anon_${user.anonCode}`,
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery("edit:name", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_name" });
  await ctx.answerCallbackQuery();
  await ctx.reply("نام نمایشی جدید را بفرست:", {
    reply_markup: cancelKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:age", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_age" });
  await ctx.answerCallbackQuery();
  await ctx.reply("بازه سن را بزن، بعد سن دقیق:", {
    reply_markup: ageRangeReplyKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:bio", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_bio" });
  await ctx.answerCallbackQuery();
  await ctx.reply("بیو جدید را بفرست (حداکثر ۱۵۰ حرف):", {
    reply_markup: cancelKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:looking", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_looking" });
  await ctx.answerCallbackQuery();
  await ctx.reply("به دنبال چه کسی هستی؟", {
    reply_markup: lookingReplyKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:gender", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { genderReplyKeyboard } = await import("../keyboards/main.js");
  await patchUser(user.id, { state: "edit_gender" });
  await ctx.answerCallbackQuery();
  await ctx.reply("جنسیت جدید را انتخاب کن:", {
    reply_markup: genderReplyKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:interests", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const {
    parseInterests,
    MAX_INTERESTS,
  } = await import("../data/interests.js");
  const { interestsKeyboard } = await import("../keyboards/main.js");
  const selected = parseInterests(user.interests);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "✨ علاقه‌مندی‌ها",
      "",
      `تا ${MAX_INTERESTS} مورد انتخاب کن.`,
      "روی هر مورد بزن تا تیک بخورد، بعد ذخیره کن.",
    ].join("\n"),
    { reply_markup: interestsKeyboard(selected) },
  );
});

featuresHandler.callbackQuery(/^interest:toggle:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const id = ctx.match[1]!;
  const {
    parseInterests,
    serializeInterests,
    MAX_INTERESTS,
    INTERESTS,
  } = await import("../data/interests.js");
  const { interestsKeyboard } = await import("../keyboards/main.js");
  if (!INTERESTS.some((i) => i.id === id)) {
    await ctx.answerCallbackQuery({ text: "نامعتبر" });
    return;
  }
  let selected = parseInterests(user.interests);
  if (selected.includes(id)) {
    selected = selected.filter((x) => x !== id);
  } else {
    if (selected.length >= MAX_INTERESTS) {
      await ctx.answerCallbackQuery({
        text: `حداکثر ${MAX_INTERESTS} مورد`,
        show_alert: true,
      });
      return;
    }
    selected = [...selected, id];
  }
  await patchUser(user.id, { interests: serializeInterests(selected) });
  await ctx.answerCallbackQuery({ text: "به‌روز شد" });
  await ctx.editMessageReplyMarkup({
    reply_markup: interestsKeyboard(selected),
  }).catch(() => undefined);
});

featuresHandler.callbackQuery("interest:save", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: "ذخیره شد" });
  const { sendProfileCard } = await import("../services/profile.js");
  await sendProfileCard(ctx, user.id);
});

featuresHandler.callbackQuery("interest:cancel", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: "بسته شد" });
  await ctx.reply("منوی اصلی:", { reply_markup: mainKeyboard() });
});

featuresHandler.callbackQuery("edit:location", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_location" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "📍 به‌روزرسانی موقعیت",
      "",
      "موقعیت جدیدت را بفرست تا افراد اطراف دقیق‌تر پیدا شوند.",
      "مختصات دقیق به کسی نشان داده نمی‌شود.",
    ].join("\n"),
    { reply_markup: editLocationKeyboard() },
  );
});

featuresHandler.callbackQuery("edit:photo", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_photo" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "یک عکس واضح بفرست.\nتا تأیید ادمین با عکس پیش‌فرض دیده می‌شوی.",
    { reply_markup: cancelKeyboard() },
  );
});

featuresHandler.on("message:location", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user) return next();

  const { latitude, longitude } = ctx.message.location;

  // ثبت‌نام — مرحله لوکیشن
  if (!user.registered && user.state === "location") {
    await saveLocation(user.id, latitude, longitude);
    const { finishRegistration } = await import("../services/register.js");
    await finishRegistration(ctx, user.id);
    return;
  }

  if (!user.registered) return next();

  if (user.state === "edit_location") {
    await saveLocation(user.id, latitude, longitude);
    await patchUser(user.id, { state: "idle" });
    await ctx.reply("✅ موقعیتت به‌روز شد.\nالان می‌توانی نزدیک‌ها را ببینی.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  // نزدیک‌ها / به‌روزرسانی عمومی موقعیت — همیشه ذخیره می‌شود
  await saveLocation(user.id, latitude, longitude);
  await patchUser(user.id, { state: "idle" });

  if (user.state === "await_location") {
    await ctx.reply("✅ موقعیت ذخیره شد. در حال پیدا کردن افراد نزدیک…");
    const { showNearbyResults } = await import("../services/nearbyUi.js");
    await showNearbyResults(ctx, user.id);
    return;
  }

  await ctx.reply("✅ موقعیتت ذخیره شد.", { reply_markup: mainKeyboard() });
});

featuresHandler.callbackQuery(/^nearby_chat:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const result = await sendChatRequest(ctx.api, user.id, Number(ctx.match[1]));
  if (result === "demo") {
    await ctx.answerCallbackQuery({ text: "نمونه" });
    await ctx.reply("پروفایل نمونه است.");
    return;
  }
  if (result === "pending") {
    await ctx.answerCallbackQuery({ text: "درخواست قبلی باز است" });
    return;
  }
  if (result !== "ok") {
    await ctx.answerCallbackQuery({ text: "ارسال نشد" });
    return;
  }
  await ctx.answerCallbackQuery({ text: "درخواست ارسال شد" });
  await ctx.reply("💬 درخواست چت ارسال شد.");
});

featuresHandler.callbackQuery("nearby_skip", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "رد شد" });
  await ctx.deleteMessage().catch(() => undefined);
});

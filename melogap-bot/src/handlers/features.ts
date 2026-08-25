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
  moreKeyboard,
} from "../keyboards/main.js";
import {
  createOrder,
  paymentUrl,
  markPaid,
  cancelOrder,
  findPackage,
} from "../services/diamonds.js";
import { formatNum, formatToman, REFERRAL_BONUS } from "../data/packages.js";
import { nextExploreProfile } from "../services/explore.js";
import { connectUsers } from "../services/match.js";
import { saveLocation, findNearby } from "../services/nearby.js";
import { nearbyUserKeyboard } from "../keyboards/nearby.js";
import { publicPhotoWithBadge } from "../lib/faceBadgePhoto.js";

export const featuresHandler = new Composer();

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
      "💳 فاکتور الماس",
      "",
      `بسته: ${pkg.label}`,
      `مبلغ: ${formatToman(pkg.toman)}`,
      `الماس: ${formatNum(pkg.diamonds)}`,
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
    `✅ ${formatNum(order.diamonds)} الماس اضافه شد.\nموجودی: ${formatNum(fresh?.diamonds ?? 0)} 💎`,
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
    await ctx.answerCallbackQuery({ text: "الماس کافی نیست" });
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

featuresHandler.callbackQuery(/^exp:like:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  await prisma.interaction.create({
    data: { type: "like", fromUserId: user.id, toUserId: targetId },
  });
  await patchUser(targetId, { likesCount: { increment: 1 } });
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (target && target.telegramId < 9000000000n) {
    await ctx.api
      .sendMessage(
        Number(target.telegramId),
        "❤️ یک نفر از اکسپلور لایک‌ات کرد!\nجزئیات در پروفایل ← تعاملات",
      )
      .catch(() => undefined);
  }
  await ctx.answerCallbackQuery({ text: "لایک شد" });
  await nextExploreProfile(ctx, user.id, {
    sameProvince: user.state === "explore_province",
  });
});

featuresHandler.callbackQuery(/^exp:chat:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const result = await connectUsers(ctx.api, user.id, targetId);
  if (result === "demo") {
    await ctx.answerCallbackQuery({ text: "پروفایل نمونه" });
    await ctx.reply("این پروفایل نمونه‌ است؛ با کاربر واقعی چت کن.");
    return;
  }
  if (result !== "ok") {
    await ctx.answerCallbackQuery({ text: "الان نمی‌شود وصل شد" });
    return;
  }
  await ctx.answerCallbackQuery({ text: "وصل شدید" });
});

featuresHandler.callbackQuery(/^exp:(next|skip)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await nextExploreProfile(ctx, user.id, {
    sameProvince: user.state === "explore_province",
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
  await nextExploreProfile(ctx, user.id, { sameProvince: true });
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
      "• شتاب‌دهی: اولویت بیشتر با الماس",
      "• الماس‌ها: خرید اعتبار",
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
      `هر دعوت موفق: ${formatNum(REFERRAL_BONUS)} الماس برای تو`,
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
      .text("بیو", "edit:bio")
      .text("علاقه", "edit:looking")
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

  // نزدیک‌ها / به‌روزرسانی عمومی موقعیت
  await saveLocation(user.id, latitude, longitude);
  if (user.state !== "await_location") {
    await patchUser(user.id, { state: "idle" });
  }

  const nearby = await findNearby(user.id);
  if (!nearby.length) {
    await ctx.reply(
      "موقعیت ذخیره شد.\nفعلاً کسی در اطراف پیدا نشد.",
      { reply_markup: mainKeyboard() },
    );
    return;
  }
  await ctx.reply(`📍 ${nearby.length} نفر اطراف تو:`, {
    reply_markup: mainKeyboard(),
  });
  for (const item of nearby) {
    const u = item.user;
    await ctx.replyWithPhoto(await publicPhotoWithBadge(ctx.api, u), {
      caption: [
        `👤 ${u.displayName ?? "ناشناس"}`,
        `فاصله تقریبی: ${item.distanceLabel}`,
        `سن: ${u.age ?? "—"}`,
        u.photoStatus !== "approved" ? "🖼️ عکس پیش‌فرض" : null,
      ]
        .filter(Boolean)
        .join("\n"),
      reply_markup: nearbyUserKeyboard(u.id),
    });
  }
});

featuresHandler.callbackQuery(/^nearby_chat:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const result = await connectUsers(ctx.api, user.id, Number(ctx.match[1]));
  if (result === "demo") {
    await ctx.answerCallbackQuery({ text: "نمونه" });
    await ctx.reply("پروفایل نمونه است.");
    return;
  }
  if (result !== "ok") {
    await ctx.answerCallbackQuery({ text: "وصل نشد" });
    return;
  }
  await ctx.answerCallbackQuery({ text: "وصل شدید" });
});

featuresHandler.callbackQuery("nearby_skip", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "رد شد" });
  await ctx.deleteMessage().catch(() => undefined);
});

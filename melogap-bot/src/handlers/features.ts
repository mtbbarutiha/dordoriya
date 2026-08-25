import { Composer, InlineKeyboard } from "grammy";
import { getByTelegramId, setState } from "../db/users.js";
import { saveLocation, findNearby } from "../services/nearby.js";
import {
  mainKeyboard,
  nearbyUserKeyboard,
} from "../keyboards/main.js";
import { connectSpecific, tryMatch } from "../services/match.js";
import {
  createOrder,
  paymentUrl,
  markPaid,
  cancelOrder,
  findPackage,
} from "../services/coins.js";
import { formatCoins, formatToman } from "../data/packages.js";
import { paymentKeyboard } from "../keyboards/main.js";
import { prisma } from "../db/prisma.js";

export const featuresHandler = new Composer();

featuresHandler.on("message:location", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const user = await getByTelegramId(from.id);
  if (!user) {
    await ctx.reply("اول /start بزن.");
    return;
  }

  const { latitude, longitude } = ctx.message.location;
  await saveLocation(user.id, latitude, longitude);

  const nearby = await findNearby(user.id);
  if (nearby.length === 0) {
    await ctx.reply(
      [
        "📍 موقعیتت ذخیره شد.",
        "",
        "فعلاً کسی تو شعاع ۵۰ کیلومتری پیدا نشد.",
        "بعداً دوباره «نزدیکای شهر» رو بزن، یا دوستات رو دعوت کن.",
      ].join("\n"),
      { reply_markup: mainKeyboard() },
    );
    return;
  }

  await ctx.reply(
    `📍 ${nearby.length} نفر اطرافته (بدون لو رفتن لوکیشن دقیق):\n`,
    { reply_markup: mainKeyboard() },
  );

  for (const item of nearby) {
    const u = item.user;
    const gender =
      u.gender === "female" ? "خانم" : u.gender === "male" ? "آقا" : "ناشناس";
    await ctx.reply(
      [
        `👤 ${gender}`,
        `فاصله تقریبی: ${item.distanceLabel}`,
        u.age ? `سن: ${u.age}` : "سن: —",
      ].join("\n"),
      { reply_markup: nearbyUserKeyboard(u.id) },
    );
  }
});

featuresHandler.callbackQuery(/^buy:(.+)$/, async (ctx) => {
  const pkgId = ctx.match[1]!;
  const from = ctx.from;
  const user = await getByTelegramId(from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  const pkg = findPackage(pkgId);
  if (!pkg) {
    await ctx.answerCallbackQuery({ text: "پکیج نامعتبر" });
    return;
  }
  const order = await createOrder(user.id, pkgId);
  if (!order) {
    await ctx.answerCallbackQuery({ text: "خطا در ساخت سفارش" });
    return;
  }
  const url = paymentUrl(order.paymentCode);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "💳 فاکتور سکه",
      "",
      `پکیج: ${pkg.label}`,
      `مبلغ: ${formatToman(pkg.toman)}`,
      `سکه: ${formatCoins(pkg.coins)}`,
      "",
      "لینک پرداخت (دمو):",
      url,
      "",
      "بعد از پرداخت فرضی، «پرداخت کردم» رو بزن تا سکه شارژ بشه.",
    ].join("\n"),
    { reply_markup: paymentKeyboard(order.id, url) },
  );
});

featuresHandler.callbackQuery(/^paid:(\d+)$/, async (ctx) => {
  const orderId = Number(ctx.match[1]);
  const user = await getByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start" });
    return;
  }
  const order = await markPaid(orderId, user.id);
  if (!order) {
    await ctx.answerCallbackQuery({ text: "سفارش پیدا نشد" });
    return;
  }
  const fresh = await getByTelegramId(ctx.from.id);
  await ctx.answerCallbackQuery({ text: "شارژ شد ✅" });
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  await ctx.reply(
    `✅ ${formatCoins(order.coins)} سکه به کیف‌ت اضافه شد.\nموجودی: ${formatCoins(fresh?.coins ?? 0)}`,
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery(/^cancel:(\d+)$/, async (ctx) => {
  const orderId = Number(ctx.match[1]);
  const user = await getByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start" });
    return;
  }
  await cancelOrder(orderId, user.id);
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  await ctx.reply("سفارش لغو شد.", { reply_markup: mainKeyboard() });
});

featuresHandler.callbackQuery(/^nearby_chat:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  const user = await getByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start" });
    return;
  }
  const result = await connectSpecific(ctx.api, user.id, targetId);
  if (result === "demo") {
    await ctx.answerCallbackQuery({ text: "پروفایل نمونه" });
    return;
  }
  if (result !== "ok") {
    await ctx.answerCallbackQuery({
      text: "الان نمی‌شه وصل شد (شاید طرف تو چته)",
    });
    return;
  }
  await ctx.answerCallbackQuery({ text: "وصل شدید ✅" });
});

featuresHandler.callbackQuery("nearby_skip", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "رد شد" });
  await ctx.deleteMessage().catch(() => undefined);
});

featuresHandler.callbackQuery(/^gender:(.+)$/, async (ctx) => {
  const g = ctx.match[1]!;
  const user = await getByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start" });
    return;
  }
  if (g === "female" || g === "male") {
    await prisma.user.update({
      where: { id: user.id },
      data: { gender: g },
    });
  }
  await ctx.answerCallbackQuery({ text: "ثبت شد" });
  await ctx.reply("فیلتر ثبت شد — می‌رم دنبال ناشناس…");
  await tryMatch(ctx, user.id);
});

featuresHandler.callbackQuery(/^setgender:(.+)$/, async (ctx) => {
  const g = ctx.match[1]!;
  const user = await getByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start" });
    return;
  }
  if (g !== "female" && g !== "male") {
    await ctx.answerCallbackQuery({ text: "نامعتبر" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { gender: g },
  });
  await ctx.answerCallbackQuery({ text: "جنسیت ذخیره شد" });
  await ctx.reply(
    `جنسیت روی «${g === "female" ? "خانم" : "آقا"}» تنظیم شد.`,
    { reply_markup: mainKeyboard() },
  );
});

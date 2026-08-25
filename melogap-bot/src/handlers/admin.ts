import { Composer, InlineKeyboard } from "grammy";
import { isAdmin } from "../lib/admin.js";
import {
  getRegistrationStats,
  listPendingPhotos,
  listPendingFaces,
} from "../services/adminStats.js";
import { formatNum } from "../data/packages.js";
import { formatAdminUserLine } from "../services/account.js";
import {
  adminPhotoKeyboard,
  adminFaceKeyboard,
} from "../keyboards/main.js";
import { genderLabel } from "../data/packages.js";

export const adminHandler = new Composer();

function adminOnly(ctx: { from?: { id: number } | undefined }) {
  return ctx.from && isAdmin(ctx.from.id);
}

export function adminPanelKeyboard(pendingPhotos: number, pendingFaces: number) {
  return new InlineKeyboard()
    .text(`📷 عکس‌ها (${formatNum(pendingPhotos)})`, "adm:photos")
    .text(`✅ احراز (${formatNum(pendingFaces)})`, "adm:faces")
    .row()
    .text("📊 آمار این ماه", "adm:stats:month")
    .text("📈 آمار ۳ ماه", "adm:stats:3m")
    .row()
    .text("👥 خلاصه کاربران", "adm:overview")
    .text("🔄 بروزرسانی", "adm:home");
}

adminHandler.command("admin", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.reply("دسترسی ادمین نداری.");
    return;
  }
  const s = await getRegistrationStats();
  await ctx.reply(
    [
      "🛠 پنل ادمین دوردوریا",
      "",
      `📷 عکس در انتظار: ${formatNum(s.pendingPhotos)}`,
      `✅ احراز در انتظار: ${formatNum(s.pendingFaces)}`,
      `👥 ثبت‌نام‌شده فعال: ${formatNum(s.totalActive)}`,
      `📅 ثبت‌نام امروز: ${formatNum(s.registeredToday)}`,
      "",
      "یک گزینه را انتخاب کن:",
    ].join("\n"),
    {
      reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
    },
  );
});

adminHandler.callbackQuery(/^adm:home$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const s = await getRegistrationStats();
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    [
      "🛠 پنل ادمین دوردوریا",
      "",
      `📷 عکس در انتظار: ${formatNum(s.pendingPhotos)}`,
      `✅ احراز در انتظار: ${formatNum(s.pendingFaces)}`,
      `👥 ثبت‌نام‌شده فعال: ${formatNum(s.totalActive)}`,
      `📅 ثبت‌نام امروز: ${formatNum(s.registeredToday)}`,
      "",
      "یک گزینه را انتخاب کن:",
    ].join("\n"),
    {
      reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
    },
  ).catch(async () => {
    await ctx.reply(
      [
        "🛠 پنل ادمین دوردوریا",
        "",
        `📷 عکس در انتظار: ${formatNum(s.pendingPhotos)}`,
        `✅ احراز در انتظار: ${formatNum(s.pendingFaces)}`,
      ].join("\n"),
      {
        reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
      },
    );
  });
});

adminHandler.callbackQuery("adm:overview", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const s = await getRegistrationStats();
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "👥 خلاصه کاربران",
      "",
      `ثبت‌نام کامل: ${formatNum(s.totalRegistered)}`,
      `فعال در اکسپلور: ${formatNum(s.totalActive)}`,
      `ثبت‌نام ناقص: ${formatNum(s.incompleteRegs)}`,
      `حساب‌های حذف‌شده: ${formatNum(s.deletedAccounts)}`,
      `عکس pending: ${formatNum(s.pendingPhotos)}`,
      `احراز pending: ${formatNum(s.pendingFaces)}`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    },
  );
});

adminHandler.callbackQuery("adm:stats:month", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const s = await getRegistrationStats();
  await ctx.answerCallbackQuery();
  const thisMonth = s.byMonth[0];
  await ctx.reply(
    [
      "📊 آمار ثبت‌نام این ماه",
      "",
      `ماه جاری (${thisMonth?.label ?? "—"}): ${formatNum(thisMonth?.count ?? s.registeredThisMonth)}`,
      `امروز: ${formatNum(s.registeredToday)}`,
      `کل فعال: ${formatNum(s.totalActive)}`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    },
  );
});

adminHandler.callbackQuery("adm:stats:3m", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const s = await getRegistrationStats();
  await ctx.answerCallbackQuery();
  const lines = s.byMonth.map(
    (m) => `• ${m.label}: ${formatNum(m.count)} نفر`,
  );
  await ctx.reply(
    [
      "📈 آمار ثبت‌نام ۳ ماه اخیر",
      "",
      ...lines,
      "",
      `جمع ۳ ماه: ${formatNum(s.registeredLast3Months)}`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    },
  );
});

adminHandler.callbackQuery("adm:photos", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const list = await listPendingPhotos(15);
  await ctx.answerCallbackQuery();
  if (!list.length) {
    await ctx.reply("📷 عکسی در انتظار تأیید نیست.", {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    });
    return;
  }
  await ctx.reply(`📷 ${formatNum(list.length)} عکس در صف تأیید:`);
  for (const u of list) {
    if (!u.photoPendingFileId) continue;
    const info = await formatAdminUserLine(u);
    await ctx.api
      .sendPhoto(ctx.from!.id, u.photoPendingFileId, {
        caption: [
          "📷 عکس پروفایل — در انتظار",
          info,
          `${genderLabel(u.gender)} | ${u.age ?? "—"} | ${[u.province, u.city].filter(Boolean).join("، ") || "—"}`,
        ].join("\n"),
        reply_markup: adminPhotoKeyboard(u.id),
      })
      .catch(() => undefined);
  }
});

adminHandler.callbackQuery("adm:faces", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const list = await listPendingFaces(15);
  await ctx.answerCallbackQuery();
  if (!list.length) {
    await ctx.reply("✅ احرازی در انتظار نیست.", {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    });
    return;
  }
  await ctx.reply(`✅ ${formatNum(list.length)} احراز در صف:`);
  for (const u of list) {
    if (!u.facePendingFileId) continue;
    const info = await formatAdminUserLine(u);
    await ctx.api
      .sendPhoto(ctx.from!.id, u.facePendingFileId, {
        caption: [
          "✅ احراز چهره — در انتظار",
          info,
          `${genderLabel(u.gender)} | ${u.age ?? "—"}`,
        ].join("\n"),
        reply_markup: adminFaceKeyboard(u.id),
      })
      .catch(() => undefined);
  }
});

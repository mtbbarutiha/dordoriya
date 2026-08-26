import { Composer, InlineKeyboard } from "grammy";
import { isAdmin } from "../lib/admin.js";
import {
  getRegistrationStats,
  listPendingPhotos,
  listPendingFaces,
} from "../services/adminStats.js";
import { formatNum } from "../data/packages.js";
import { formatAdminUserLine } from "../services/account.js";
import { sendPendingFaceToAdmin } from "../services/profile.js";
import {
  adminPhotoKeyboard,
} from "../keyboards/main.js";
import { genderLabel } from "../data/packages.js";

export const adminHandler = new Composer();

function adminOnly(ctx: { from?: { id: number } | undefined }) {
  return ctx.from && isAdmin(ctx.from.id);
}

export function adminPanelKeyboard(pendingPhotos: number, pendingFaces: number) {
  return new InlineKeyboard()
    .text(`📷 عکس‌های در انتظار تایید (${formatNum(pendingPhotos)})`, "adm:photos")
    .row()
    .text(`✅ پروفایل‌های در انتظار احراز (${formatNum(pendingFaces)})`, "adm:faces")
    .row()
    .text("🪙 افزودن سکه به کاربر", "adm:givecoins")
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
      "—— صف تایید ——",
      `📷 عکس‌های در انتظار تایید: ${formatNum(s.pendingPhotos)}`,
      `✅ پروفایل‌های در انتظار احراز: ${formatNum(s.pendingFaces)}`,
      "",
      "🪙 افزودن سکه به کاربر از دکمه پایین",
      "",
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
      "—— صف تایید ——",
      `📷 عکس‌های در انتظار تایید: ${formatNum(s.pendingPhotos)}`,
      `✅ پروفایل‌های در انتظار احراز: ${formatNum(s.pendingFaces)}`,
      "",
      "🪙 افزودن سکه به کاربر از دکمه پایین",
      "",
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
        `📷 عکس‌های در انتظار تایید: ${formatNum(s.pendingPhotos)}`,
        `✅ پروفایل‌های در انتظار احراز: ${formatNum(s.pendingFaces)}`,
        "🪙 افزودن سکه به کاربر از دکمه پایین",
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
    await sendPendingFaceToAdmin(ctx.api, ctx.from!.id, u);
  }
});

adminHandler.callbackQuery("adm:givecoins", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(admin.id, {
    state: "admin_give_code",
    pendingAnonTo: null,
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "🪙 افزودن سکه به کاربر",
      "",
      "شناسه ربات کاربر را بفرست:",
      "مثال: Rd4z5A یا /user_Rd4z5A",
      "",
      "انصراف: /cancel",
    ].join("\n"),
  );
});

/** دریافت شناسه / مقدار سکه از ادمین */
adminHandler.on("message:text", async (ctx, next) => {
  if (!adminOnly(ctx)) return next();
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();

  const { findByTelegram, patchUser, findByUserCode } = await import(
    "../db/users.js"
  );
  const { prisma } = await import("../db/prisma.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) return next();

  if (admin.state === "admin_give_code") {
    let code = text.replace(/^\/user_/i, "").trim();
    if (code.startsWith("user_")) code = code.slice(5);
    const target =
      (await findByUserCode(code)) ??
      (await prisma.user.findFirst({
        where: {
          OR: [
            { userCode: code },
            { id: Number.isFinite(Number(code)) ? Number(code) : -1 },
          ],
          deletedAt: null,
        },
      }));
    if (!target || !target.registered) {
      await ctx.reply("کاربر پیدا نشد. شناسه را دوباره بفرست یا /cancel");
      return;
    }
    await patchUser(admin.id, {
      state: "admin_give_amount",
      pendingAnonTo: String(target.id),
    });
    await ctx.reply(
      [
        `کاربر: ${target.displayName ?? "—"}`,
        `آیدی: /user_${target.userCode ?? "—"}`,
        `موجودی فعلی: ${formatNum(target.diamonds)} سکه`,
        "",
        "تعداد سکه را به‌صورت عدد بفرست (مثلاً ۱۰۰):",
      ].join("\n"),
    );
    return;
  }

  if (admin.state === "admin_give_amount" && admin.pendingAnonTo) {
    const amount = Number(text.replace(/[^\d]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      await ctx.reply("عدد معتبر بفرست (۱ تا ۱۰۰۰۰۰۰) یا /cancel");
      return;
    }
    const targetId = Number(admin.pendingAnonTo);
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
      await ctx.reply("کاربر پیدا نشد.", {
        reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
      });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { diamonds: { increment: amount } },
    });
    await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
    await ctx.reply(
      [
        "✅ سکه اضافه شد",
        `کاربر: ${target.displayName ?? "—"} (/user_${target.userCode ?? "—"})`,
        `➕ ${formatNum(amount)} سکه`,
        `موجودی جدید: ${formatNum(updated.diamonds)} سکه`,
      ].join("\n"),
      {
        reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
      },
    );
    if (target.telegramId < 9000000000n) {
      await ctx.api
        .sendMessage(
          Number(target.telegramId),
          [
            "🎁 از طرف پشتیبانی دوردوریا",
            `${formatNum(amount)} سکه به حسابت اضافه شد.`,
            `موجودی: ${formatNum(updated.diamonds)} 🪙`,
          ].join("\n"),
        )
        .catch(() => undefined);
    }
    return;
  }

  return next();
});

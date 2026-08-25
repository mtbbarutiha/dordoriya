import { Composer } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import { prisma } from "../db/prisma.js";
import {
  mainKeyboard,
  profileEditKeyboard,
  confirmDeleteKeyboard,
  cancelKeyboard,
  accountManageKeyboard,
} from "../keyboards/main.js";
import { formatNum, FACE_VERIFY_COST } from "../data/packages.js";
import {
  sendProfileCard,
  notifyAdminsPhoto,
  notifyAdminsFace,
} from "../services/profile.js";
import { isAdmin } from "../lib/admin.js";
import { publicPhotoInput } from "../lib/avatars.js";

export const profileHandler = new Composer();

profileHandler.callbackQuery("prof:edit", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply("چه چیزی را ویرایش می‌کنی؟", {
    reply_markup: profileEditKeyboard(),
  });
});

profileHandler.callbackQuery("prof:complete", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const missing: string[] = [];
  if (!user.bio) missing.push("بیو");
  if (user.photoStatus !== "approved") missing.push("عکس تأییدشده");
  if (!user.faceVerified) missing.push("احراز چهره");
  if (!user.city) missing.push("شهر");

  await ctx.reply(
    [
      "🧾 تکمیل پروفایل",
      "",
      missing.length
        ? `موارد ناقص:\n• ${missing.join("\n• ")}`
        : "✅ پروفایلت کامل است!",
      "",
      "از دکمه‌ها ادامه بده:",
    ].join("\n"),
    {
      reply_markup: profileEditKeyboard()
        .row()
        .text("📷 ارسال عکس", "prof:photo")
        .text("احراز چهره", "prof:face"),
    },
  );
});

profileHandler.callbackQuery("prof:manage", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply("مدیریت حساب:", {
    reply_markup: accountManageKeyboard(user.isActive),
  });
});

profileHandler.callbackQuery("prof:back", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await sendProfileCard(ctx, user.id);
});

profileHandler.callbackQuery("prof:close", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "بسته شد" });
  await ctx.reply("منوی اصلی:", { reply_markup: mainKeyboard() });
});

profileHandler.callbackQuery("prof:interactions", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();

  const since = new Date(Date.now() - 24 * 3600_000);
  const [likes24, views24, recentLikes] = await Promise.all([
    prisma.interaction.count({
      where: { toUserId: user.id, type: "like", createdAt: { gte: since } },
    }),
    prisma.interaction.count({
      where: { toUserId: user.id, type: "view", createdAt: { gte: since } },
    }),
    prisma.interaction.findMany({
      where: { toUserId: user.id, type: "like" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { fromUser: true },
    }),
  ]);

  const lines = recentLikes.map((i, idx) => {
    const n = i.fromUser.displayName ?? "ناشناس";
    const g = i.fromUser.gender === "female" ? "👩" : i.fromUser.gender === "male" ? "👨" : "👤";
    return `${idx + 1}. ${g} ${n} — ${i.createdAt.toLocaleString("fa-IR")}`;
  });

  await ctx.reply(
    [
      "┏━━ 💬 تعاملات ━━┓",
      `┃ ❤️ لایک کل: ${formatNum(user.likesCount)}`,
      `┃ ❤️ لایک ۲۴س: ${formatNum(likes24)}`,
      `┃ 👁 بازدید کل: ${formatNum(user.viewsCount)}`,
      `┃ 👁 بازدید ۲۴س: ${formatNum(views24)}`,
      `┃ 💬 چت‌ها: ${formatNum(user.chatsCount)}`,
      "┗━━━━━━━━━━━━┛",
      "",
      "آخرین لایک‌ها:",
      lines.length ? lines.join("\n") : "هنوز لایکی نداری.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

profileHandler.callbackQuery("prof:photo", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_photo" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "📷 عکس پروفایل",
      "",
      "یک عکس واضح از خودت بفرست.",
      "تا تأیید ادمین، برای بقیه همان عکس پیش‌فرض نمایش داده می‌شود.",
      user.photoStatus === "pending"
        ? "⏳ الان یک عکس در صف تأیید داری."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: cancelKeyboard() },
  );
});

profileHandler.callbackQuery("prof:face", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (user.faceVerified) {
    await ctx.answerCallbackQuery({ text: "قبلاً تأیید شده" });
    await ctx.reply("✅ احراز چهره تو قبلاً تأیید شده است.");
    return;
  }
  if (user.diamonds < FACE_VERIFY_COST) {
    await ctx.answerCallbackQuery({ text: "الماس کافی نیست" });
    await ctx.reply(
      `احراز چهره ${formatNum(FACE_VERIFY_COST)} الماس می‌خواهد.\nموجودی: ${formatNum(user.diamonds)}`,
    );
    return;
  }
  await patchUser(user.id, { state: "edit_face" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "✅ احراز چهره",
      "",
      `هزینه پس از تأیید ادمین: ${formatNum(FACE_VERIFY_COST)} 💎`,
      "یک سلفی واضح بفرست (چهره‌ات مشخص باشد).",
      user.faceStatus === "pending" ? "⏳ درخواست قبلی هنوز در بررسی است." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: cancelKeyboard() },
  );
});

profileHandler.callbackQuery("prof:toggle", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const next = !user.isActive;
  await patchUser(user.id, { isActive: next });
  await ctx.answerCallbackQuery({
    text: next ? "حساب فعال شد" : "حساب غیرفعال شد",
  });
  await ctx.reply(
    next
      ? "▶️ حسابت فعال شد و دوباره در اکسپلور دیده می‌شوی."
      : "⏸️ حسابت غیرفعال شد و از اکسپلور مخفی شدی. هر وقت خواستی دوباره فعال کن.",
    { reply_markup: mainKeyboard() },
  );
});

profileHandler.callbackQuery("prof:delete", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "⚠️ مطمئنی حسابت حذف شود؟ این کار برگشت‌پذیر نیست.",
    { reply_markup: confirmDeleteKeyboard() },
  );
});

profileHandler.callbackQuery("prof:delete:no", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  const user = await requireRegistered(ctx);
  if (user) await sendProfileCard(ctx, user.id);
});

profileHandler.callbackQuery("prof:delete:yes", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { deleteAccountPermanently } = await import("../services/account.js");
  const { leaveQueueOrChat } = await import("../services/match.js");
  await leaveQueueOrChat(ctx.api, user, true);
  const oldId = user.id;
  await deleteAccountPermanently(user);
  await ctx.answerCallbackQuery({ text: "حذف شد" });
  await ctx.reply(
    [
      "🗑️ حسابت حذف شد.",
      `شناسهٔ قبلی تو: #${oldId}`,
      "",
      "با /start می‌توانی حساب کاملاً جدید بسازی.",
      "(شناسهٔ قدیمی برای ادمین قابل مشاهده می‌ماند)",
    ].join("\n"),
  );
});

/** آپلود عکس پروفایل / احراز */
profileHandler.on("message:photo", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user) return next();

  const photos = ctx.message.photo;
  const best = photos[photos.length - 1];
  if (!best) return next();

  if (user.state === "edit_photo") {
    await patchUser(user.id, {
      photoPendingFileId: best.file_id,
      photoStatus: "pending",
      state: "idle",
    });
    await notifyAdminsPhoto(ctx.api, user, best.file_id);
    await ctx.reply(
      [
        "📷 عکس دریافت شد.",
        "وضعیت: ⏳ در انتظار تأیید ادمین",
        "",
        "تا قبل از تأیید، در اکسپلور با عکس پیش‌فرض دیده می‌شوی.",
      ].join("\n"),
      { reply_markup: mainKeyboard() },
    );
    return;
  }

  if (user.state === "edit_face") {
    await patchUser(user.id, {
      facePendingFileId: best.file_id,
      faceStatus: "pending",
      faceVerified: false,
      state: "idle",
    });
    await notifyAdminsFace(ctx.api, user, best.file_id);
    await ctx.reply(
      "✅ سلفی احراز دریافت شد و برای بررسی ادمین ارسال شد.",
      { reply_markup: mainKeyboard() },
    );
    return;
  }

  return next();
});

/** تأیید/رد ادمین */
profileHandler.callbackQuery(/^adm:photo:(ok|no):(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "دسترسی نداری" });
    return;
  }
  const ok = ctx.match[1] === "ok";
  const userId = Number(ctx.match[2]);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.photoPendingFileId) {
    await ctx.answerCallbackQuery({ text: "چیزی برای بررسی نیست" });
    return;
  }

  if (ok) {
    await patchUser(user.id, {
      photoFileId: user.photoPendingFileId,
      photoPendingFileId: null,
      photoStatus: "approved",
    });
    await ctx.answerCallbackQuery({ text: "تأیید شد" });
    await ctx.api
      .sendMessage(
        Number(user.telegramId),
        "✅ عکس پروفایلت تأیید شد و الان برای بقیه نمایش داده می‌شود.",
      )
      .catch(() => undefined);
  } else {
    await patchUser(user.id, {
      photoPendingFileId: null,
      photoStatus: "rejected",
    });
    await ctx.answerCallbackQuery({ text: "رد شد" });
    await ctx.api
      .sendMessage(
        Number(user.telegramId),
        "❌ عکس پروفایلت رد شد. لطفاً عکس مناسب‌تری از بخش پروفایل بفرست.",
      )
      .catch(() => undefined);
  }
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message && "caption" in ctx.callbackQuery.message
      ? String(ctx.callbackQuery.message.caption ?? "")
      : "") + `\n\nنتیجه: ${ok ? "✅ تأیید" : "❌ رد"}`,
  }).catch(() => undefined);
});

profileHandler.callbackQuery(/^adm:face:(ok|no):(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "دسترسی نداری" });
    return;
  }
  const ok = ctx.match[1] === "ok";
  const userId = Number(ctx.match[2]);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    await ctx.answerCallbackQuery({ text: "کاربر نیست" });
    return;
  }

  if (ok) {
    const fresh = await prisma.user.findUnique({ where: { id: userId } });
    if (fresh && fresh.diamonds >= FACE_VERIFY_COST) {
      await patchUser(user.id, {
        faceVerified: true,
        faceStatus: "approved",
        facePendingFileId: null,
        diamonds: { decrement: FACE_VERIFY_COST },
      });
    } else {
      await patchUser(user.id, {
        faceVerified: true,
        faceStatus: "approved",
        facePendingFileId: null,
      });
    }
    await ctx.answerCallbackQuery({ text: "احراز شد" });
    await ctx.api
      .sendMessage(
        Number(user.telegramId),
        `✅ احراز چهره‌ات تأیید شد.\n${formatNum(FACE_VERIFY_COST)} الماس کم شد.`,
      )
      .catch(() => undefined);
  } else {
    await patchUser(user.id, {
      faceVerified: false,
      faceStatus: "rejected",
      facePendingFileId: null,
    });
    await ctx.answerCallbackQuery({ text: "رد شد" });
    await ctx.api
      .sendMessage(
        Number(user.telegramId),
        "❌ احراز چهره رد شد. دوباره از پروفایل → احراز چهره سلفی بفرست.",
      )
      .catch(() => undefined);
  }
});

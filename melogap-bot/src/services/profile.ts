import type { Api, Context } from "grammy";
import { prisma } from "../db/prisma.js";
import { formatNum, FACE_VERIFY_REWARD } from "../data/packages.js";
import {
  photoStatusLabel,
} from "../lib/avatars.js";
import { ownPhotoWithBadge } from "../lib/faceBadgePhoto.js";
import {
  profilePanelKeyboard,
  adminPhotoKeyboard,
  adminFaceKeyboard,
  faceVerifyIntroKeyboard,
} from "../keyboards/main.js";
import { getAdminIds } from "../lib/admin.js";
import { formatAdminUserLine } from "./account.js";

export async function sendProfileCard(ctx: Context, userId: number) {
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return;
  if (!user.userCode) {
    const { ensureUserCode } = await import("../db/users.js");
    await ensureUserCode(user.id, user.userCode);
    user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
  }

  const genderEmoji =
    user.gender === "female" ? "👩" : user.gender === "male" ? "🧔‍♂️" : "👤";
  const lang = user.language === "en" ? "En" : "Fa";
  const interest =
    user.lookingFor === "any"
      ? "👫 دوست‌یابی"
      : user.lookingFor === "female"
        ? "👩‍❤️‍👨 دوست‌یابی"
        : "👫 دوست‌یابی";
  const locParts = [
    user.city,
    user.province,
    user.country === "IR"
      ? "Iran"
      : user.country === "AF"
        ? "Afghanistan"
        : user.country === "TR"
          ? "Turkey"
          : user.country,
  ].filter(Boolean);

  const hasGps = user.latitude != null && user.longitude != null;
  const text = [
    `❤️ ${formatNum(user.likesCount)} لایک`,
    "",
    user.userCode ? `آیدی: /user_${user.userCode}` : null,
    `${genderEmoji} ${user.displayName ?? "بدون نام"} (${user.age ?? "—"}) | ${lang}`,
    locParts.length ? locParts.join(" - ") : "مکان ثبت نشده",
    interest,
    "",
    `💰 ${formatNum(user.diamonds)} | 👁 ${formatNum(user.viewsCount)}`,
    `عکس: ${photoStatusLabel(user.photoStatus)}`,
    hasGps ? "📍 موقعیت: ثبت‌شده (قابل ویرایش)" : "📍 موقعیت: ثبت نشده",
    !user.isActive ? "⏸️ حساب غیرفعال" : null,
  ]
    .filter(Boolean)
    .join("\n");

  await ctx.replyWithPhoto(await ownPhotoWithBadge(ctx.api, user), {
    caption: text,
    reply_markup: profilePanelKeyboard(
      user.isActive,
      user.faceVerified,
      user.likesCount,
    ),
  });
}

/** نمایش عکس پروفایل + راهنمای احراز (مثل دوردور) */
export async function sendFaceVerifyIntro(
  ctx: Context,
  user: {
    photoFileId: string | null;
    photoStatus: string;
    faceStatus: string;
  },
) {
  if (user.photoStatus !== "approved" || !user.photoFileId) {
    await ctx.reply(
      [
        "برای احراز چهره اول باید عکس پروفایل تأییدشده داشته باشی.",
        "از پروفایل → تکمیل پروفایل / ارسال عکس، عکس بفرست.",
      ].join("\n"),
    );
    return false;
  }

  const pendingNote =
    user.faceStatus === "pending"
      ? "\n\n⏳ یک درخواست قبلی هنوز در صف ادمین است؛ با ارسال ویدیو جدید جایگزین می‌شود."
      : "";

  await ctx.replyWithPhoto(user.photoFileId, {
    caption: [
      "👆 این عکس ۱ پروفایل شماست",
      "",
      "⚠️ توجه مهم",
      "ویدیو مسیج ارسالی برای احراز چهره باید با عکس ۱ پروفایل شما که در بالا نمایش داده شده، تطابق چهره داشته باشد.",
      "",
      `🎁 جایزه پس از تأیید ادمین: ${formatNum(FACE_VERIFY_REWARD)} سکه`,
      pendingNote,
    ]
      .filter(Boolean)
      .join("\n"),
    reply_markup: faceVerifyIntroKeyboard(),
  });
  return true;
}

export async function notifyAdminsPhoto(
  api: Api,
  user: {
    id: number;
    telegramId: bigint;
    displayName: string | null;
    username?: string | null;
  },
  fileId: string,
) {
  const admins = getAdminIds();
  const info = await formatAdminUserLine(user);
  for (const adminId of admins) {
    await api
      .sendPhoto(adminId, fileId, {
        caption: ["📷 عکس پروفایل جدید برای تأیید", info].join("\n"),
        reply_markup: adminPhotoKeyboard(user.id),
      })
      .catch(() => undefined);
  }
}

export async function notifyAdminsFace(
  api: Api,
  user: {
    id: number;
    telegramId: bigint;
    displayName: string | null;
    username?: string | null;
    photoFileId?: string | null;
  },
  videoFileId: string,
  kind: "video_note" | "video",
) {
  const admins = getAdminIds();
  const info = await formatAdminUserLine(user);
  const caption = [
    "✅ درخواست احراز چهره",
    "عکس پروفایل ↑ و ویدیو ↓ را مقایسه کن",
    info,
    `نوع: ${kind === "video_note" ? "ویدیو مسیج (دایره‌ای)" : "ویدیو"}`,
  ].join("\n");

  for (const adminId of admins) {
    try {
      if (user.photoFileId) {
        await api.sendPhoto(adminId, user.photoFileId, {
          caption: "📷 عکس پروفایل کاربر",
        });
      }
      if (kind === "video_note") {
        await api.sendVideoNote(adminId, videoFileId);
        await api.sendMessage(adminId, caption, {
          reply_markup: adminFaceKeyboard(user.id),
        });
      } else {
        await api.sendVideo(adminId, videoFileId, {
          caption,
          reply_markup: adminFaceKeyboard(user.id),
        });
      }
    } catch {
      // ignore per-admin failures
    }
  }
}

/** ارسال مجدد مدیای احراز برای ادمین */
export async function sendPendingFaceToAdmin(
  api: Api,
  adminId: number,
  user: {
    id: number;
    displayName: string | null;
    username?: string | null;
    gender?: string | null;
    age?: number | null;
    photoFileId?: string | null;
    facePendingFileId: string | null;
    facePendingKind?: string | null;
    telegramId: bigint;
  },
) {
  if (!user.facePendingFileId) return;
  const info = await formatAdminUserLine(user);
  const kind =
    user.facePendingKind === "video" ? "video" : "video_note";
  const caption = [
    "✅ احراز چهره — در انتظار",
    info,
    `${user.gender === "female" ? "خانم" : user.gender === "male" ? "آقا" : "—"} | ${user.age ?? "—"}`,
  ].join("\n");

  if (user.photoFileId) {
    await api
      .sendPhoto(adminId, user.photoFileId, { caption: "📷 عکس پروفایل" })
      .catch(() => undefined);
  }
  if (kind === "video_note") {
    await api
      .sendVideoNote(adminId, user.facePendingFileId)
      .catch(() => undefined);
    await api
      .sendMessage(adminId, caption, {
        reply_markup: adminFaceKeyboard(user.id),
      })
      .catch(() => undefined);
  } else {
    await api
      .sendVideo(adminId, user.facePendingFileId, {
        caption,
        reply_markup: adminFaceKeyboard(user.id),
      })
      .catch(() => undefined);
  }
}

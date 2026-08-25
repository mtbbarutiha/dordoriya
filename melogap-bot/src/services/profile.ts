import type { Api, Context } from "grammy";
import { prisma } from "../db/prisma.js";
import {
  formatNum,
  genderLabel,
} from "../data/packages.js";
import {
  ownPhotoInput,
  photoStatusLabel,
} from "../lib/avatars.js";
import { profilePanelKeyboard } from "../keyboards/main.js";
import { getAdminIds } from "../lib/admin.js";
import { adminPhotoKeyboard, adminFaceKeyboard } from "../keyboards/main.js";
import { formatAdminUserLine } from "./account.js";

export async function sendProfileCard(ctx: Context, userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return;

  const interest =
    user.lookingFor === "any" ? "همه" : genderLabel(user.lookingFor);
  const boosted =
    user.boostUntil && user.boostUntil > new Date()
      ? `🚀 تا ${user.boostUntil.toLocaleString("fa-IR")}`
      : "—";
  const face =
    user.faceVerified
      ? "✅ تأیید شده"
      : user.faceStatus === "pending"
        ? "⏳ در انتظار"
        : "❌ نشده";

  const box = [
    "┏━━ 👤 پروفایل من ━━┓",
    `┃ نام: ${user.displayName ?? "—"}`,
    `┃ جنسیت: ${genderLabel(user.gender)} | سن: ${user.age ?? "—"}`,
    `┃ علاقه: ${interest}`,
    user.bio ? `┃ بیو: ${user.bio}` : "┃ بیو: —",
    user.province || user.city
      ? `┃ 📍 ${[user.province, user.city].filter(Boolean).join("، ")}`
      : "┃ 📍 —",
    `┃ الماس: ${formatNum(user.diamonds)} 💎`,
    `┃ پرو: ${user.isPro ? "🅿️ فعال" : "غیرفعال"}`,
    `┃ شتاب‌دهی: ${boosted}`,
    `┃ عکس: ${photoStatusLabel(user.photoStatus)}`,
    `┃ احراز چهره: ${face}`,
    `┃ وضعیت حساب: ${user.isActive ? "🟢 فعال" : "⏸️ غیرفعال"}`,
    "┗━━━━━━━━━━━━━━┛",
    "",
    "از دکمه‌های زیر مدیریت کن:",
  ].join("\n");

  await ctx.replyWithPhoto(ownPhotoInput(user), {
    caption: box,
    reply_markup: profilePanelKeyboard(user.isActive),
  });
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
  },
  fileId: string,
) {
  const admins = getAdminIds();
  const info = await formatAdminUserLine(user);
  for (const adminId of admins) {
    await api
      .sendPhoto(adminId, fileId, {
        caption: ["✅ درخواست احراز چهره", info].join("\n"),
        reply_markup: adminFaceKeyboard(user.id),
      })
      .catch(() => undefined);
  }
}

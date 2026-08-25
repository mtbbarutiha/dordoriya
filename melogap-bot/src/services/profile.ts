import type { Api, Context } from "grammy";
import { prisma } from "../db/prisma.js";
import { formatNum } from "../data/packages.js";
import {
  ownPhotoInput,
  photoStatusLabel,
} from "../lib/avatars.js";
import {
  profilePanelKeyboard,
  adminPhotoKeyboard,
  adminFaceKeyboard,
} from "../keyboards/main.js";
import { getAdminIds } from "../lib/admin.js";
import { formatAdminUserLine } from "./account.js";

export async function sendProfileCard(ctx: Context, userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return;

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

  const box = [
    `${genderEmoji} ${user.displayName ?? "بدون نام"} (${user.age ?? "—"}) | ${lang}`,
    locParts.length ? locParts.join(" - ") : "مکان ثبت نشده",
    interest,
    "",
    `💎 ${formatNum(user.diamonds)} | 👁 ${formatNum(user.viewsCount)} | ❤️ ${formatNum(user.likesCount)}`,
    `عکس: ${photoStatusLabel(user.photoStatus)}`,
    user.faceVerified
      ? "✅ احراز چهره"
      : user.faceStatus === "pending"
        ? "⏳ احراز در انتظار"
        : null,
    !user.isActive ? "⏸️ حساب غیرفعال" : null,
  ]
    .filter(Boolean)
    .join("\n");

  await ctx.replyWithPhoto(ownPhotoInput(user), {
    caption: box,
    reply_markup: profilePanelKeyboard(user.isActive, user.faceVerified),
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

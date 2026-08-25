import { prisma } from "../db/prisma.js";
import { patchUser } from "../db/users.js";
import { genderLabel, formatNum } from "../data/packages.js";
import type { Context } from "grammy";
import { exploreKeyboard, mainKeyboard } from "../keyboards/main.js";
import type { Prisma } from "@prisma/client";
import { publicPhotoInput } from "../lib/avatars.js";

export async function nextExploreProfile(
  ctx: Context,
  viewerId: number,
  opts: { sameProvince?: boolean } = {},
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return;

  const seen = await prisma.exploreSeen.findMany({
    where: { viewerId },
    select: { shownId: true },
  });
  const seenIds = seen.map((s) => s.shownId);

  const where: Prisma.UserWhereInput = {
    registered: true,
    isActive: true,
    deletedAt: null,
    id: { not: viewerId, ...(seenIds.length ? { notIn: seenIds } : {}) },
  };
  if (me.lookingFor && me.lookingFor !== "any") {
    where.gender = me.lookingFor;
  }
  if (opts.sameProvince && me.province) {
    where.province = me.province;
    if (me.country) where.country = me.country;
  }

  let candidate = await prisma.user.findFirst({
    where,
    orderBy: [{ boostUntil: "desc" }, { lastActiveAt: "desc" }],
  });

  if (!candidate && seenIds.length) {
    await prisma.exploreSeen.deleteMany({ where: { viewerId } });
    const where2: Prisma.UserWhereInput = {
      registered: true,
      isActive: true,
      deletedAt: null,
      id: { not: viewerId },
    };
    if (me.lookingFor && me.lookingFor !== "any") {
      where2.gender = me.lookingFor;
    }
    if (opts.sameProvince && me.province) {
      where2.province = me.province;
      if (me.country) where2.country = me.country;
    }
    candidate = await prisma.user.findFirst({
      where: where2,
      orderBy: [{ boostUntil: "desc" }, { lastActiveAt: "desc" }],
    });
  }

  if (!candidate) {
    await ctx.reply(
      opts.sameProvince
        ? "فعلاً هم‌استانی جدیدی پیدا نشد.\nبعداً دوباره امتحان کن."
        : "فعلاً پروفایل جدیدی برای اکسپلور نیست.\nبعداً دوباره امتحان کن یا دوستانت را دعوت کن.",
      { reply_markup: mainKeyboard() },
    );
    return;
  }

  await prisma.exploreSeen.upsert({
    where: { viewerId_shownId: { viewerId, shownId: candidate.id } },
    create: { viewerId, shownId: candidate.id },
    update: {},
  });
  await patchUser(candidate.id, { viewsCount: { increment: 1 } });
  await prisma.interaction.create({
    data: { type: "view", fromUserId: viewerId, toUserId: candidate.id },
  });

  const loc = [candidate.province, candidate.city].filter(Boolean).join("، ");
  const title = opts.sameProvince ? "🏘 هم‌استانی" : "🎡 اکسپلور";
  const text = [
    `┏━━ ${title} ━━┓`,
    `┃ 👤 ${candidate.displayName ?? "بدون نام"}`,
    `┃ ${genderLabel(candidate.gender)} | ${candidate.age ?? "—"} سال`,
    loc ? `┃ 📍 ${loc}` : null,
    candidate.bio ? `┃ ${candidate.bio}` : null,
    `┃ 👁 ${formatNum(candidate.viewsCount + 1)} | ❤️ ${formatNum(candidate.likesCount)}`,
    candidate.faceVerified ? "┃ ✅ احراز چهره" : null,
    candidate.boostUntil && candidate.boostUntil > new Date()
      ? "┃ 🚀 شتاب‌دهی"
      : null,
    candidate.isPro ? "┃ 🅿️ پرو" : null,
    candidate.photoStatus !== "approved" ? "┃ 🖼️ عکس پیش‌فرض" : null,
    "┗━━━━━━━━━━━━┛",
  ]
    .filter(Boolean)
    .join("\n");

  // برای دکمه‌های بعدی، حالت را نگه می‌داریم
  await patchUser(viewerId, {
    state: opts.sameProvince ? "explore_province" : "explore",
  });

  await ctx.replyWithPhoto(publicPhotoInput(candidate), {
    caption: text,
    reply_markup: exploreKeyboard(candidate.id),
  });
}

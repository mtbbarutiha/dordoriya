import { prisma } from "../db/prisma.js";
import { patchUser } from "../db/users.js";
import { genderLabel, formatNum } from "../data/packages.js";
import type { Context } from "grammy";
import { exploreKeyboard, mainKeyboard } from "../keyboards/main.js";
import type { Prisma } from "@prisma/client";
import { publicPhotoWithBadge } from "../lib/faceBadgePhoto.js";
import { haversineKm, formatDistance } from "../lib/geo.js";

export type ExploreMode =
  | "explore"
  | "explore_province"
  | "explore_age"
  | "explore_new"
  | "explore_nochats"
  | "explore_popular";

export type ExploreOpts = {
  sameProvince?: boolean;
  sameAge?: boolean;
  newUsers?: boolean;
  noChats?: boolean;
  popular?: boolean;
};

export function exploreOptsFromState(state: string): ExploreOpts {
  switch (state) {
    case "explore_province":
      return { sameProvince: true };
    case "explore_age":
      return { sameAge: true };
    case "explore_new":
      return { newUsers: true };
    case "explore_nochats":
      return { noChats: true };
    case "explore_popular":
      return { popular: true };
    default:
      return {};
  }
}

export function exploreStateFromOpts(opts: ExploreOpts): ExploreMode {
  if (opts.sameProvince) return "explore_province";
  if (opts.sameAge) return "explore_age";
  if (opts.newUsers) return "explore_new";
  if (opts.noChats) return "explore_nochats";
  if (opts.popular) return "explore_popular";
  return "explore";
}

function titleFor(opts: ExploreOpts): string {
  if (opts.sameProvince) return "🏘 هم‌استانی";
  if (opts.sameAge) return "👤 هم‌سن";
  if (opts.newUsers) return "✨ کاربران جدید";
  if (opts.noChats) return "🚶 بدون چت";
  if (opts.popular) return "❤️ محبوب‌ها";
  return "🔍 جستجو";
}

function applyFilters(
  where: Prisma.UserWhereInput,
  me: {
    lookingFor: string | null;
    province: string | null;
    country: string | null;
    age: number | null;
  },
  opts: ExploreOpts,
) {
  if (me.lookingFor && me.lookingFor !== "any") {
    where.gender = me.lookingFor;
  }
  if (opts.sameProvince && me.province) {
    where.province = me.province;
    if (me.country) where.country = me.country;
  }
  if (opts.sameAge && me.age != null) {
    where.age = { gte: me.age - 2, lte: me.age + 2 };
  }
  if (opts.noChats) {
    where.chatsCount = 0;
  }
}

function orderFor(opts: ExploreOpts): Prisma.UserOrderByWithRelationInput[] {
  if (opts.popular) {
    return [{ likesCount: "desc" }, { lastActiveAt: "desc" }];
  }
  if (opts.newUsers) {
    return [{ createdAt: "desc" }];
  }
  return [{ boostUntil: "desc" }, { lastActiveAt: "desc" }];
}

export async function nextExploreProfile(
  ctx: Context,
  viewerId: number,
  opts: ExploreOpts = {},
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
  applyFilters(where, me, opts);

  let candidate = await prisma.user.findFirst({
    where,
    orderBy: orderFor(opts),
  });

  if (!candidate && seenIds.length) {
    await prisma.exploreSeen.deleteMany({ where: { viewerId } });
    const where2: Prisma.UserWhereInput = {
      registered: true,
      isActive: true,
      deletedAt: null,
      id: { not: viewerId },
    };
    applyFilters(where2, me, opts);
    candidate = await prisma.user.findFirst({
      where: where2,
      orderBy: orderFor(opts),
    });
  }

  if (!candidate) {
    await ctx.reply(
      `فعلاً کسی با این فیلتر پیدا نشد.\nاز «${"جستجو کاربران 🔍🗨️"}» فیلتر دیگری بزن.`,
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
  let distanceLine: string;
  if (
    me.latitude != null &&
    me.longitude != null &&
    candidate.latitude != null &&
    candidate.longitude != null
  ) {
    const km = haversineKm(
      me.latitude,
      me.longitude,
      candidate.latitude,
      candidate.longitude,
    );
    distanceLine = `🏁 فاصله از شما: ${formatDistance(km)}`;
  } else {
    distanceLine = "🏁 فاصله از شما: نامعلوم";
  }

  const text = [
    `❤️ ${formatNum(candidate.likesCount)} لایک`,
    "",
    `┏━━ ${titleFor(opts)} ━━┓`,
    `┃ 👤 ${candidate.displayName ?? "بدون نام"}`,
    `┃ ${genderLabel(candidate.gender)} | ${candidate.age ?? "—"} سال`,
    loc ? `┃ 📍 ${loc}` : null,
    candidate.bio ? `┃ ${candidate.bio}` : null,
    `┃ 👁 ${formatNum(candidate.viewsCount + 1)}`,
    `┃ ${distanceLine}`,
    candidate.boostUntil && candidate.boostUntil > new Date()
      ? "┃ 🚀 شتاب‌دهی"
      : null,
    candidate.isPro ? "┃ 🅿️ پرو" : null,
    candidate.photoStatus !== "approved" ? "┃ 🖼️ عکس پیش‌فرض" : null,
    "┗━━━━━━━━━━━━┛",
  ]
    .filter(Boolean)
    .join("\n");

  await patchUser(viewerId, { state: exploreStateFromOpts(opts) });

  await ctx.replyWithPhoto(await publicPhotoWithBadge(ctx.api, candidate), {
    caption: text,
    reply_markup: exploreKeyboard(candidate.id, candidate.likesCount),
  });
}

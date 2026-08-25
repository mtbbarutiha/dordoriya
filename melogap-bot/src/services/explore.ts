import { prisma } from "../db/prisma.js";
import { patchUser, ensureUserCode } from "../db/users.js";
import { genderLabel, formatNum } from "../data/packages.js";
import { InlineKeyboard, type Context } from "grammy";
import { exploreKeyboard, mainKeyboard } from "../keyboards/main.js";
import type { Prisma } from "@prisma/client";
import {
  publicPhotoWithBadge,
  listThumbWithBadge,
} from "../lib/faceBadgePhoto.js";
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

function listIntro(opts: ExploreOpts): string {
  if (opts.sameProvince) {
    return "لیست افراد هم‌استانی که ۳ روز اخیر آنلاین بودند.";
  }
  if (opts.sameAge) return "لیست هم‌سن‌هایی که اخیراً آنلاین بودند.";
  if (opts.newUsers) return "لیست کاربران جدید:";
  if (opts.noChats) return "لیست کاربرانی که هنوز چت نکرده‌اند:";
  if (opts.popular) return "لیست محبوب‌ترین‌ها بر اساس لایک:";
  return "لیست کاربران مطابق فیلتر تو:";
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
  // فعال در ۳ روز اخیر برای لیست‌های مکانی/سنی
  if (opts.sameProvince || opts.sameAge) {
    where.lastActiveAt = {
      gte: new Date(Date.now() - 3 * 24 * 3600_000),
    };
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

function isOnlineNow(lastActiveAt: Date): boolean {
  return Date.now() - lastActiveAt.getTime() <= 15 * 60_000;
}

function onlineStatus(u: {
  lastActiveAt: Date;
  state: string;
  chatPartnerId: number | null;
}): string {
  const mins = (Date.now() - u.lastActiveAt.getTime()) / 60_000;
  const chatting = u.state === "chatting" || u.chatPartnerId != null;
  if (mins <= 15) {
    return chatting
      ? "هم‌اکنون 👀 آنلاین (درحال چت 🗣️)"
      : "هم‌اکنون 👀 آنلاین";
  }
  if (mins <= 60 * 24) return "امروز آنلاین بوده";
  return "آخرین بازدید چند روز پیش";
}

function listCaption(
  u: {
    userCode: string | null;
    displayName: string | null;
    age: number | null;
    city: string | null;
    province: string | null;
    likesCount: number;
    lastActiveAt: Date;
    state: string;
    chatPartnerId: number | null;
    latitude: number | null;
    longitude: number | null;
    faceVerified: boolean;
  },
  me: { latitude: number | null; longitude: number | null },
): string {
  const code = u.userCode ?? "????";
  const online = isOnlineNow(u.lastActiveAt) ? "🟢 " : "";
  const special = u.faceVerified ? " ⭐" : "";
  const name = u.displayName ?? "بدون‌نام";
  const age = u.age ?? "—";
  const place = [u.city, u.province ? `(${u.province})` : null]
    .filter(Boolean)
    .join("");
  let dist = "";
  if (
    me.latitude != null &&
    me.longitude != null &&
    u.latitude != null &&
    u.longitude != null
  ) {
    const km = haversineKm(me.latitude, me.longitude, u.latitude, u.longitude);
    dist = ` (🏁 ${formatDistance(km)})`;
  }
  return [
    `${online}${name} ${age}${special}`,
    `/user_${code}`,
    `${place || "—"}${dist} (❤️ ${formatNum(u.likesCount)})`,
    onlineStatus(u),
  ].join("\n");
}

/** لیست سرچ با عکس کنار هر نفر */
export async function sendSearchList(
  ctx: Context,
  viewerId: number,
  opts: ExploreOpts = {},
  limit = 12,
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return;

  const where: Prisma.UserWhereInput = {
    registered: true,
    isActive: true,
    deletedAt: null,
    id: { not: viewerId },
  };
  applyFilters(where, me, opts);

  const list = await prisma.user.findMany({
    where,
    orderBy: orderFor(opts),
    take: limit,
  });

  if (!list.length) {
    await ctx.reply("فعلاً کسی با این فیلتر پیدا نشد.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  for (const u of list) {
    if (!u.userCode) await ensureUserCode(u.id, u.userCode);
  }
  const refreshed = await prisma.user.findMany({
    where: { id: { in: list.map((x) => x.id) } },
  });
  const byId = new Map(refreshed.map((u) => [u.id, u]));
  const ordered = list.map((u) => byId.get(u.id)!).filter(Boolean);

  await patchUser(viewerId, { state: exploreStateFromOpts(opts) });

  await ctx.reply(
    ["کی را نشون بدم؟ انتخاب کن 👇", listIntro(opts), "", "روی عکس یا /user_ بزن."].join(
      "\n",
    ),
  );

  for (const u of ordered) {
    try {
      const thumb = await listThumbWithBadge(ctx.api, u);
      await ctx.replyWithPhoto(thumb, {
        caption: listCaption(u, {
          latitude: me.latitude,
          longitude: me.longitude,
        }),
        reply_markup: new InlineKeyboard().text(
          "👤 مشاهده پروفایل",
          `open:${u.userCode}`,
        ),
      });
    } catch (err) {
      console.error("list photo failed", u.id, err);
      await ctx.reply(
        listCaption(u, {
          latitude: me.latitude,
          longitude: me.longitude,
        }),
      );
    }
  }

  await ctx.reply("⬆️ لیست بالا — یکی را انتخاب کن.", {
    reply_markup: mainKeyboard(),
  });
}

/** باز کردن پروفایل با /user_CODE */
export async function showProfileByUserCode(
  ctx: Context,
  viewerId: number,
  userCode: string,
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return;

  const candidate = await prisma.user.findUnique({ where: { userCode } });
  if (!candidate || candidate.deletedAt || !candidate.registered) {
    await ctx.reply("این کاربر پیدا نشد یا غیرفعال است.");
    return;
  }
  if (candidate.id === viewerId) {
    const { sendProfileCard } = await import("./profile.js");
    await sendProfileCard(ctx, viewerId);
    return;
  }
  if (!candidate.isActive) {
    await ctx.reply("این حساب فعلاً غیرفعال است.");
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

  const loc = [candidate.city, candidate.province].filter(Boolean).join(" - ");
  let distanceLine = "🏁 فاصله از شما: نامعلوم";
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
  }

  const online = isOnlineNow(candidate.lastActiveAt) ? "🟢 " : "";
  const text = [
    `❤️ ${formatNum(candidate.likesCount)} لایک`,
    "",
    `آیدی: /user_${candidate.userCode}`,
    `${online}👤 ${candidate.displayName ?? "بدون نام"} (${candidate.age ?? "—"})`,
    `┃ ${genderLabel(candidate.gender)}`,
    loc ? `┃ 📍 ${loc}` : null,
    candidate.bio ? `┃ ${candidate.bio}` : null,
    `┃ 👁 ${formatNum(candidate.viewsCount + 1)}`,
    `┃ ${distanceLine}`,
    `┃ ${onlineStatus(candidate)}`,
    candidate.faceVerified ? "┃ ⭐ کاربر ویژه" : "┃ 🕶 کاربر ناشناس",
    candidate.isPro ? "┃ 🅿️ پرو" : null,
    "┗━━━━━━━━━━━━┛",
  ]
    .filter(Boolean)
    .join("\n");

  await ctx.replyWithPhoto(await publicPhotoWithBadge(ctx.api, candidate), {
    caption: text,
    reply_markup: exploreKeyboard(candidate.id, candidate.likesCount),
  });
}

/** بعدی/رد — یک پروفایل تصادفی با همان فیلتر */
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
    await ctx.reply("پروفایل دیگری در این فیلتر نیست.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  if (!candidate.userCode) {
    await ensureUserCode(candidate.id, candidate.userCode);
    const again = await prisma.user.findUnique({ where: { id: candidate.id } });
    if (again?.userCode) {
      await showProfileByUserCode(ctx, viewerId, again.userCode);
      return;
    }
  } else {
    await showProfileByUserCode(ctx, viewerId, candidate.userCode);
  }
}

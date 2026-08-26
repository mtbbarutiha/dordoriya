import { prisma } from "../db/prisma.js";
import { patchUser, ensureUserCode } from "../db/users.js";
import { genderLabel, formatNum } from "../data/packages.js";
import { InlineKeyboard, type Context } from "grammy";
import {
  exploreKeyboard,
  mainKeyboard,
  searchListFooterKeyboard,
} from "../keyboards/main.js";
import type { Prisma } from "@prisma/client";
import {
  publicPhotoWithBadge,
  listThumbWithBadge,
  faceBadgeKind,
  faceBadgeEmoji,
} from "../lib/faceBadgePhoto.js";
import { haversineKm, formatDistance } from "../lib/geo.js";
import { formatInterestsLine } from "../data/interests.js";

export type ExploreMode =
  | "explore"
  | "explore_province"
  | "explore_age"
  | "explore_new"
  | "explore_nochats"
  | "explore_popular"
  | "explore_all";

export type ExploreOpts = {
  sameProvince?: boolean;
  sameAge?: boolean;
  newUsers?: boolean;
  noChats?: boolean;
  popular?: boolean;
  /** بدون فیلتر جنسیت علاقه — برای مشاهده همه / هم‌استانی کامل‌تر */
  ignoreLookingFor?: boolean;
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
    case "explore_all":
      return { ignoreLookingFor: true };
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
  if (opts.ignoreLookingFor) return "explore_all";
  return "explore";
}

export function optsKeyFromExplore(opts: ExploreOpts): string {
  if (opts.sameProvince) return "province";
  if (opts.sameAge) return "age";
  if (opts.newUsers) return "new";
  if (opts.noChats) return "nochats";
  if (opts.popular) return "popular";
  if (opts.ignoreLookingFor) return "all";
  return "default";
}

export function exploreOptsFromKey(key: string): ExploreOpts {
  switch (key) {
    case "province":
      return { sameProvince: true };
    case "age":
      return { sameAge: true };
    case "new":
      return { newUsers: true };
    case "nochats":
      return { noChats: true };
    case "popular":
      return { popular: true };
    case "all":
      return { ignoreLookingFor: true };
    default:
      return {};
  }
}

function listIntro(opts: ExploreOpts): string {
  if (opts.sameProvince) return "لیست افراد هم‌استانی:";
  if (opts.sameAge) return "لیست هم‌سن‌ها:";
  if (opts.newUsers) return "لیست کاربران جدید:";
  if (opts.noChats) return "لیست کاربرانی که هنوز چت نکرده‌اند:";
  if (opts.popular) return "لیست محبوب‌ترین‌ها بر اساس لایک:";
  if (opts.ignoreLookingFor) return "مشاهده همه کاربران فعال:";
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
  softActivity = false,
) {
  if (!opts.ignoreLookingFor && me.lookingFor && me.lookingFor !== "any") {
    where.gender = me.lookingFor;
  }
  if (opts.sameProvince && me.province) {
    where.province = me.province;
    if (me.country) where.country = me.country;
  }
  if (opts.sameAge && me.age != null) {
    where.age = { gte: me.age - 3, lte: me.age + 3 };
  }
  if (opts.noChats) {
    where.chatsCount = 0;
  }
  // فعالیت اخیر — برای هم‌استانی/هم‌سن نرم‌تر (۳۰ روز)
  if ((opts.sameProvince || opts.sameAge) && !softActivity) {
    where.lastActiveAt = {
      gte: new Date(Date.now() - 30 * 24 * 3600_000),
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
  if (mins <= 60) return "کمتر از یک ساعت پیش آنلاین";
  if (mins <= 60 * 24) return "امروز آنلاین بوده";
  if (mins <= 60 * 24 * 7) return "این هفته آنلاین بوده";
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
  const badge = faceBadgeEmoji(faceBadgeKind(u, false));
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
    `${online}${name} ${age} ${badge}`,
    `/user_${code}`,
    `${place || "—"}${dist} (❤️ ${formatNum(u.likesCount)})`,
    onlineStatus(u),
  ].join("\n");
}

async function queryList(
  viewerId: number,
  me: {
    lookingFor: string | null;
    province: string | null;
    country: string | null;
    age: number | null;
  },
  opts: ExploreOpts,
  limit: number,
) {
  const where: Prisma.UserWhereInput = {
    registered: true,
    isActive: true,
    deletedAt: null,
    id: { not: viewerId },
  };
  applyFilters(where, me, opts, false);

  let list = await prisma.user.findMany({
    where,
    orderBy: orderFor(opts),
    take: limit,
  });

  // اگر هم‌استانی خالی بود: بدون محدودیت فعالیت / بدون فیلتر علاقه
  if (!list.length && opts.sameProvince && me.province) {
    const where2: Prisma.UserWhereInput = {
      registered: true,
      isActive: true,
      deletedAt: null,
      id: { not: viewerId },
      province: me.province,
      ...(me.country ? { country: me.country } : {}),
    };
    list = await prisma.user.findMany({
      where: where2,
      orderBy: orderFor(opts),
      take: limit,
    });
  }

  return list;
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

  if (opts.sameProvince && !me.province) {
    await ctx.reply("اول استان را در پروفایل ثبت کن.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  const list = await queryList(viewerId, me, opts, limit);

  if (!list.length) {
    await ctx.reply(
      [
        "فعلاً کسی با این فیلتر پیدا نشد.",
        opts.sameProvince
          ? `استان تو: ${me.province ?? "—"} — شاید هنوز هم‌استانی فعالی ثبت‌نام نکرده.`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      { reply_markup: mainKeyboard() },
    );
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

  await patchUser(viewerId, {
    state: exploreStateFromOpts(opts),
    lastActiveAt: new Date(),
  });

  const key = optsKeyFromExplore(opts);
  await ctx.reply(
    [
      "کی را نشون بدم؟ انتخاب کن 👇",
      listIntro(opts),
      "",
      "روی «مشاهده پروفایل» یا /user_ بزن.",
    ].join("\n"),
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
        {
          reply_markup: new InlineKeyboard().text(
            "👤 مشاهده پروفایل",
            `open:${u.userCode}`,
          ),
        },
      );
    }
  }

  await ctx.reply("⬆️ لیست بالا — یکی را انتخاب کن یا:", {
    reply_markup: searchListFooterKeyboard(key),
  });
}

/** خلاصه همه — اسم، عکس، وضعیت، آخرین آنلاین */
export async function sendViewAllList(
  ctx: Context,
  viewerId: number,
  opts: ExploreOpts = {},
  limit = 20,
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return;

  const list = await queryList(
    viewerId,
    me,
    { ...opts, ignoreLookingFor: opts.ignoreLookingFor ?? true },
    limit,
  );

  if (!list.length) {
    await ctx.reply("فعلاً کاربری برای نمایش نیست.", {
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

  await patchUser(viewerId, { state: "explore_all", lastActiveAt: new Date() });
  await ctx.reply(`📋 مشاهده همه (${ordered.length} نفر):`);

  for (const u of ordered) {
    const badge = faceBadgeEmoji(faceBadgeKind(u, false));
    const online = isOnlineNow(u.lastActiveAt) ? "🟢" : "⚪";
    const caption = [
      `${online} ${u.displayName ?? "بدون‌نام"} ${u.age ?? "—"} ${badge}`,
      `/user_${u.userCode}`,
      [u.city, u.province].filter(Boolean).join(" - ") || "—",
      onlineStatus(u),
    ].join("\n");
    try {
      const thumb = await listThumbWithBadge(ctx.api, u);
      await ctx.replyWithPhoto(thumb, {
        caption,
        reply_markup: new InlineKeyboard().text(
          "👤 پروفایل",
          `open:${u.userCode}`,
        ),
      });
    } catch {
      await ctx.reply(caption);
    }
  }

  await ctx.reply("پایان لیست مشاهده همه.", {
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
  const badge = faceBadgeEmoji(faceBadgeKind(candidate, false));
  const interests = formatInterestsLine(candidate.interests);
  const text = [
    `❤️ ${formatNum(candidate.likesCount)} لایک`,
    "",
    `آیدی: /user_${candidate.userCode}`,
    `${online}👤 ${candidate.displayName ?? "بدون نام"} (${candidate.age ?? "—"}) ${badge}`,
    `┃ ${genderLabel(candidate.gender)}`,
    loc ? `┃ 📍 ${loc}` : null,
    candidate.bio ? `┃ ${candidate.bio}` : null,
    interests ? `┃ ✨ ${interests}` : null,
    `┃ 👁 ${formatNum(candidate.viewsCount + 1)}`,
    `┃ ${distanceLine}`,
    `┃ ${onlineStatus(candidate)}`,
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

/** بعدی/رد — یک پروفایل تصادفی با همان فیلتر (از فوتر لیست) */
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

  if (!candidate && opts.sameProvince && me.province) {
    candidate = await prisma.user.findFirst({
      where: {
        registered: true,
        isActive: true,
        deletedAt: null,
        id: { not: viewerId },
        province: me.province,
      },
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

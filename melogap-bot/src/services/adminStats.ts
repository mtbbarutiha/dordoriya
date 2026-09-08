import { prisma } from "../db/prisma.js";
import {
  LIKE_GIFT_DIAMONDS,
  THREAD_GIFT_COST,
  DIRECT_MSG_COST,
} from "../data/packages.js";
import { formatUptime, getUptimeSec } from "../lib/logger.js";
import { getPollWatch, HEARTBEAT_FILE } from "../lib/pollWatch.js";
import { channelChatId, channelUsername } from "../middleware/forceJoin.js";
import { isDemoPayAllowed } from "./diamonds.js";
import fs from "node:fs";

import { tehranTodayStart } from "./dailyCoin.js";

export type CoinSpendBlock = {
  likes: number;
  likeCoins: number;
  threads: number;
  threadCoins: number;
  directMsgs: number;
  dmCoins: number;
  quickMatchCharges: number;
  quickMatchCoins: number;
  quickMatchRefunded: number;
  quickMatchRefundCoins: number;
  coinSells: number;
  sellCoins: number;
  /** مجموع خالص مصرف قابل‌اندازه‌گیری */
  total: number;
};

async function sumCoinSpend(from?: Date, to?: Date): Promise<CoinSpendBlock> {
  const createdRange =
    from || to
      ? {
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: to } : {}),
        }
      : undefined;

  const [
    likes,
    threads,
    directMsgs,
    quickNet,
    quickRefund,
    sells,
  ] = await Promise.all([
    prisma.interaction.count({
      where: {
        type: "like",
        ...(createdRange ? { createdAt: createdRange } : {}),
      },
    }),
    prisma.interaction.count({
      where: {
        type: "thread",
        ...(createdRange ? { createdAt: createdRange } : {}),
      },
    }),
    prisma.directMessage.count({
      where: {
        status: { in: ["sent", "read"] },
        ...(createdRange ? { createdAt: createdRange } : {}),
      },
    }),
    prisma.quickMatchCharge.aggregate({
      where: {
        refundedAt: null,
        ...(createdRange ? { connectedAt: createdRange } : {}),
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.quickMatchCharge.aggregate({
      where: {
        refundedAt: { not: null },
        ...(createdRange ? { connectedAt: createdRange } : {}),
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.coinSellRequest.aggregate({
      where: {
        status: { in: ["open", "paid"] },
        ...(createdRange ? { createdAt: createdRange } : {}),
      },
      _count: true,
      _sum: { coins: true },
    }),
  ]);

  const likeCoins = likes * LIKE_GIFT_DIAMONDS;
  const threadCoins = threads * THREAD_GIFT_COST;
  const dmCoins = directMsgs * DIRECT_MSG_COST;
  const quickMatchCoins = quickNet._sum.amount ?? 0;
  const quickMatchRefundCoins = quickRefund._sum.amount ?? 0;
  const sellCoins = sells._sum.coins ?? 0;

  return {
    likes,
    likeCoins,
    threads,
    threadCoins,
    directMsgs,
    dmCoins,
    quickMatchCharges: quickNet._count,
    quickMatchCoins,
    quickMatchRefunded: quickRefund._count,
    quickMatchRefundCoins,
    coinSells: sells._count,
    sellCoins,
    total: likeCoins + threadCoins + dmCoins + quickMatchCoins + sellCoins,
  };
}

/** آمار مصرف سکه کاربران (تقریبی از رویدادهای ثبت‌شده) */
export async function getCoinSpendStats() {
  const now = new Date();
  const todayStart = tehranTodayStart();
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = startOfMonth(now.getFullYear(), now.getMonth());

  const [today, yesterday, week, month, all] = await Promise.all([
    sumCoinSpend(todayStart),
    sumCoinSpend(yesterdayStart, todayStart),
    sumCoinSpend(weekStart),
    sumCoinSpend(monthStart),
    sumCoinSpend(),
  ]);

  /** برترین مصرف‌کننده‌ها در ۷ روز اخیر (قابل‌اندازه‌گیری) */
  const topSpenders = await getTopCoinSpenders(weekStart, 10);

  return { today, yesterday, week, month, all, topSpenders };
}

async function getTopCoinSpenders(from: Date, limit: number) {
  const [likeRows, threadRows, dmRows, qmRows, sellRows] = await Promise.all([
    prisma.interaction.groupBy({
      by: ["fromUserId"],
      where: { type: "like", createdAt: { gte: from } },
      _count: true,
    }),
    prisma.interaction.groupBy({
      by: ["fromUserId"],
      where: { type: "thread", createdAt: { gte: from } },
      _count: true,
    }),
    prisma.directMessage.groupBy({
      by: ["fromUserId"],
      where: {
        status: { in: ["sent", "read"] },
        createdAt: { gte: from },
      },
      _count: true,
    }),
    prisma.quickMatchCharge.groupBy({
      by: ["payerId"],
      where: { refundedAt: null, connectedAt: { gte: from } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.coinSellRequest.groupBy({
      by: ["userId"],
      where: {
        status: { in: ["open", "paid"] },
        createdAt: { gte: from },
      },
      _sum: { coins: true },
      _count: true,
    }),
  ]);

  const map = new Map<number, number>();
  const add = (userId: number, coins: number) => {
    map.set(userId, (map.get(userId) ?? 0) + coins);
  };
  for (const r of likeRows) add(r.fromUserId, r._count * LIKE_GIFT_DIAMONDS);
  for (const r of threadRows) add(r.fromUserId, r._count * THREAD_GIFT_COST);
  for (const r of dmRows) add(r.fromUserId, r._count * DIRECT_MSG_COST);
  for (const r of qmRows) add(r.payerId, r._sum.amount ?? 0);
  for (const r of sellRows) add(r.userId, r._sum.coins ?? 0);

  const ranked = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (ranked.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ranked.map(([id]) => id) } },
    select: {
      id: true,
      displayName: true,
      userCode: true,
      username: true,
      diamonds: true,
    },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return ranked.map(([userId, spent]) => ({
    userId,
    spent,
    user: byId.get(userId) ?? null,
  }));
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const d = startOfToday();
  d.setDate(d.getDate() - 6);
  return d;
}

function todayRegisteredWhere(from: Date) {
  return {
    registered: true,
    deletedAt: null,
    createdAt: { gte: from },
  } as const;
}

/** ثبت‌نام‌های امروز (تهران) به تفکیک جنسیت */
export async function getTodayRegistrationByGender() {
  const todayStart = tehranTodayStart();
  const base = todayRegisteredWhere(todayStart);
  const [female, male, other, total] = await Promise.all([
    prisma.user.count({ where: { ...base, gender: "female" } }),
    prisma.user.count({ where: { ...base, gender: "male" } }),
    prisma.user.count({
      where: {
        ...base,
        OR: [{ gender: null }, { gender: { notIn: ["female", "male"] } }],
      },
    }),
    prisma.user.count({ where: base }),
  ]);
  return {
    dateLabel: todayStart.toLocaleDateString("fa-IR", {
      timeZone: "Asia/Tehran",
      dateStyle: "full",
    }),
    female,
    male,
    other,
    total,
  };
}

export async function getRegistrationStats() {
  const now = new Date();
  const monthStart = startOfMonth(now.getFullYear(), now.getMonth());
  const threeMonths = startOfMonth(now.getFullYear(), now.getMonth() - 2);
  const todayStart = tehranTodayStart();

  const [
    totalRegistered,
    totalActive,
    registeredToday,
    registeredTodayFemale,
    registeredTodayMale,
    registeredTodayOther,
    registeredThisMonth,
    registeredLast3Months,
    pendingPhotos,
    pendingFaces,
    deletedAccounts,
    incompleteRegs,
    registeredFemale,
    registeredMale,
    registeredOtherGender,
  ] = await Promise.all([
    prisma.user.count({ where: { registered: true, deletedAt: null } }),
    prisma.user.count({
      where: { registered: true, isActive: true, deletedAt: null },
    }),
    prisma.user.count({ where: todayRegisteredWhere(todayStart) }),
    prisma.user.count({
      where: { ...todayRegisteredWhere(todayStart), gender: "female" },
    }),
    prisma.user.count({
      where: { ...todayRegisteredWhere(todayStart), gender: "male" },
    }),
    prisma.user.count({
      where: {
        ...todayRegisteredWhere(todayStart),
        OR: [{ gender: null }, { gender: { notIn: ["female", "male"] } }],
      },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: monthStart },
      },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: threeMonths },
      },
    }),
    prisma.user.count({
      where: { photoStatus: "pending", deletedAt: null },
    }),
    prisma.user.count({
      where: { faceStatus: "pending", deletedAt: null },
    }),
    prisma.deletedAccount.count(),
    prisma.user.count({
      where: { registered: false, deletedAt: null },
    }),
    prisma.user.count({
      where: { registered: true, deletedAt: null, gender: "female" },
    }),
    prisma.user.count({
      where: { registered: true, deletedAt: null, gender: "male" },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        OR: [
          { gender: null },
          { gender: { notIn: ["female", "male"] } },
        ],
      },
    }),
  ]);

  const byMonth: { label: string; count: number; female: number; male: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const from = startOfMonth(y, m);
    const to = startOfMonth(y, m + 1);
    const baseWhere = {
      registered: true,
      deletedAt: null,
      createdAt: { gte: from, lt: to },
    } as const;
    const [count, female, male] = await Promise.all([
      prisma.user.count({ where: baseWhere }),
      prisma.user.count({ where: { ...baseWhere, gender: "female" } }),
      prisma.user.count({ where: { ...baseWhere, gender: "male" } }),
    ]);
    const label = from.toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
    });
    byMonth.push({ label, count, female, male });
  }

  return {
    totalRegistered,
    totalActive,
    registeredToday,
    registeredTodayFemale,
    registeredTodayMale,
    registeredTodayOther,
    registeredThisMonth,
    registeredLast3Months,
    pendingPhotos,
    pendingFaces,
    deletedAccounts,
    incompleteRegs,
    registeredFemale,
    registeredMale,
    registeredOtherGender,
    byMonth,
  };
}

export async function listPendingPhotos(limit = 20) {
  return prisma.user.findMany({
    where: {
      photoStatus: "pending",
      photoPendingFileId: { not: null },
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export async function listPendingFaces(limit = 20) {
  return prisma.user.findMany({
    where: {
      faceStatus: "pending",
      facePendingFileId: { not: null },
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

async function sumPaid(from?: Date, to?: Date) {
  const where: {
    status: string;
    updatedAt?: { gte?: Date; lt?: Date };
  } = { status: "paid" };
  if (from || to) {
    where.updatedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}),
    };
  }
  const agg = await prisma.diamondOrder.aggregate({
    where,
    _sum: { amountToman: true, diamonds: true },
    _count: true,
  });
  return {
    toman: agg._sum.amountToman ?? 0,
    diamonds: agg._sum.diamonds ?? 0,
    orders: agg._count,
  };
}

/** آمار درآمد از سفارش‌های پرداخت‌شده سکه */
export async function getRevenueStats() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = startOfMonth(now.getFullYear(), now.getMonth());

  const [today, yesterday, week, month, all, pending] = await Promise.all([
    sumPaid(todayStart),
    sumPaid(yesterdayStart, todayStart),
    sumPaid(weekStart),
    sumPaid(monthStart),
    sumPaid(),
    prisma.diamondOrder.aggregate({
      where: { status: "pending" },
      _sum: { amountToman: true, diamonds: true },
      _count: true,
    }),
  ]);

  const recentPaid = await prisma.diamondOrder.findMany({
    where: { status: "paid" },
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          userCode: true,
          username: true,
        },
      },
    },
  });

  return {
    today,
    yesterday,
    week,
    month,
    all,
    pending: {
      toman: pending._sum.amountToman ?? 0,
      diamonds: pending._sum.diamonds ?? 0,
      orders: pending._count,
    },
    recentPaid,
  };
}

/** داشبورد زنده برای لانچ / تبلیغات */

const liveUserBase = {
  deletedAt: null,
  registered: true,
} as const;

/** آمار زنده چت — فقط شمارش (بدون مشاهده گفتگو) */
export async function getLiveChatStats() {
  const [chattingUsers, chattingOrphaned, waitingQueue, partnerWithoutChatting] =
    await Promise.all([
      prisma.user.count({
        where: {
          ...liveUserBase,
          state: "chatting",
          chatPartnerId: { not: null },
        },
      }),
      prisma.user.count({
        where: {
          ...liveUserBase,
          state: "chatting",
          chatPartnerId: null,
        },
      }),
      prisma.user.count({
        where: {
          ...liveUserBase,
          state: "waiting",
        },
      }),
      prisma.user.count({
        where: {
          ...liveUserBase,
          state: { not: "chatting" },
          chatPartnerId: { not: null },
        },
      }),
    ]);
  return {
    chattingUsers,
    activeChatPairs: Math.floor(chattingUsers / 2),
    waitingQueue,
    chattingOrphaned,
    partnerWithoutChatting,
  };
}

export async function getLaunchDashboard() {
  const todayStart = startOfToday();
  const weekStart = startOfWeek();

  const [
    totalUsers,
    registeredToday,
    registeredWeek,
    chattingNow,
    waitingQueue,
    coinsCirculation,
    likesToday,
    threadsToday,
    pendingOrders,
    paidToday,
    spendToday,
    dbOk,
  ] = await Promise.all([
    prisma.user.count({ where: { registered: true, deletedAt: null } }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: todayStart },
      },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: weekStart },
      },
    }),
    prisma.user.count({
      where: { state: "chatting", deletedAt: null },
    }),
    prisma.user.count({
      where: { state: "waiting", deletedAt: null },
    }),
    prisma.user.aggregate({
      where: { deletedAt: null },
      _sum: { diamonds: true },
    }),
    prisma.interaction.count({
      where: { type: "like", createdAt: { gte: todayStart } },
    }),
    prisma.interaction.count({
      where: { type: "thread", createdAt: { gte: todayStart } },
    }),
    prisma.diamondOrder.count({
      where: { status: { in: ["pending", "awaiting_review"] } },
    }),
    prisma.diamondOrder.aggregate({
      where: { status: "paid", updatedAt: { gte: todayStart } },
      _sum: { amountToman: true, diamonds: true },
      _count: true,
    }),
    sumCoinSpend(todayStart),
    prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
  ]);

  const spentTodayApprox = spendToday.total;

  let heartbeatAgeSec: number | null = null;
  let heartbeatReason = "—";
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) {
      const raw = fs.readFileSync(HEARTBEAT_FILE, "utf8").trim();
      const [epoch, , ...rest] = raw.split(/\s+/);
      const ms = Number(epoch);
      if (Number.isFinite(ms) && ms > 1e12) {
        heartbeatAgeSec = Math.round((Date.now() - ms) / 1000);
      }
      heartbeatReason = rest.join(" ") || "ok";
    }
  } catch {
    /* ignore */
  }

  const poll = getPollWatch();
  const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

  return {
    totalUsers,
    registeredToday,
    registeredWeek,
    chattingNow,
    waitingQueue,
    coinsCirculation: coinsCirculation._sum.diamonds ?? 0,
    likesToday,
    threadsToday,
    spentTodayApprox,
    spendToday,
    pendingOrders,
    paidToday: {
      toman: paidToday._sum.amountToman ?? 0,
      diamonds: paidToday._sum.diamonds ?? 0,
      orders: paidToday._count,
    },
    dbOk,
    uptime: formatUptime(),
    uptimeSec: getUptimeSec(),
    heartbeatAgeSec,
    heartbeatReason,
    pollOk: poll.pollOkCount,
    pollFail: poll.pollFailCount,
    memMb,
    pid: process.pid,
    demoPay: isDemoPayAllowed(),
    forceJoinChannel: channelUsername(),
    forceJoinChatId: String(channelChatId()),
    nodeEnv: process.env.NODE_ENV ?? "—",
    mode: process.env.MELOGAP_MODE ?? "—",
    webAppUrl: (process.env.WEB_APP_URL ?? "").trim() || null,
  };
}

/** وضعیت چک عضویت کانال (ربات باید ادمین باشد) */
export async function checkForceJoinHealth(
  api: { getChatMember: (chatId: string | number, userId: number) => Promise<{ status: string }> },
  botId: number,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const m = await api.getChatMember(channelChatId(), botId);
    const admin = m.status === "administrator" || m.status === "creator";
    if (admin) {
      return { ok: true, detail: `ربات ${m.status} کانال است ✅` };
    }
    return {
      ok: false,
      detail: `ربات عضو است (${m.status}) ولی ادمین نیست — چک خودکار کار نمی‌کند`,
    };
  } catch (err) {
    const msg =
      err && typeof err === "object" && "description" in err
        ? String((err as { description: unknown }).description)
        : err instanceof Error
          ? err.message
          : String(err);
    if (/inaccessible|CHAT_ADMIN_REQUIRED|not enough rights/i.test(msg)) {
      return {
        ok: false,
        detail: "ربات ادمین کانال نیست — member list inaccessible",
      };
    }
    return { ok: false, detail: msg.slice(0, 120) };
  }
}


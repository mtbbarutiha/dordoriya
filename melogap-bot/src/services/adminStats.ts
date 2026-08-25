import { prisma } from "../db/prisma.js";

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

export async function getRegistrationStats() {
  const now = new Date();
  const monthStart = startOfMonth(now.getFullYear(), now.getMonth());
  const threeMonths = startOfMonth(now.getFullYear(), now.getMonth() - 2);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalRegistered,
    totalActive,
    registeredToday,
    registeredThisMonth,
    registeredLast3Months,
    pendingPhotos,
    pendingFaces,
    deletedAccounts,
    incompleteRegs,
  ] = await Promise.all([
    prisma.user.count({ where: { registered: true, deletedAt: null } }),
    prisma.user.count({
      where: { registered: true, isActive: true, deletedAt: null },
    }),
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
  ]);

  const byMonth: { label: string; count: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const from = startOfMonth(y, m);
    const to = startOfMonth(y, m + 1);
    const count = await prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: from, lt: to },
      },
    });
    const label = from.toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
    });
    byMonth.push({ label, count });
  }

  return {
    totalRegistered,
    totalActive,
    registeredToday,
    registeredThisMonth,
    registeredLast3Months,
    pendingPhotos,
    pendingFaces,
    deletedAccounts,
    incompleteRegs,
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

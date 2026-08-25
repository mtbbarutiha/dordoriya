import { prisma } from "../db/prisma.js";
import { NEARBY_RADIUS_KM } from "../data/packages.js";
import { formatDistance, haversineKm } from "../lib/geo.js";

export async function saveLocation(
  userId: number,
  latitude: number,
  longitude: number,
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      latitude,
      longitude,
      locationAt: new Date(),
      state: "idle",
      lastActiveAt: new Date(),
    },
  });
}

export async function findNearby(userId: number) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.latitude || !me?.longitude) return [];

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: userId },
      registered: true,
      isActive: true,
      deletedAt: null,
      latitude: { not: null },
      longitude: { not: null },
    },
  });

  return candidates
    .map((u) => ({
      user: u,
      km: haversineKm(me.latitude!, me.longitude!, u.latitude!, u.longitude!),
    }))
    .filter((x) => x.km <= NEARBY_RADIUS_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, 10)
    .map((x) => ({ ...x, distanceLabel: formatDistance(x.km) }));
}

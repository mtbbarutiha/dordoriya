import { prisma } from "../db/prisma.js";
import { NEARBY_LIMIT, NEARBY_RADIUS_KM } from "../data/packages.js";
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
      latitude: { not: null },
      longitude: { not: null },
    },
  });

  return candidates
    .map((u) => {
      const km = haversineKm(
        me.latitude!,
        me.longitude!,
        u.latitude!,
        u.longitude!,
      );
      return { user: u, km };
    })
    .filter((x) => x.km <= NEARBY_RADIUS_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, NEARBY_LIMIT)
    .map((x) => ({
      ...x,
      distanceLabel: formatDistance(x.km),
    }));
}

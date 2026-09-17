import { prisma } from "../db/prisma.js";

const TEHRAN_TZ = "Asia/Tehran";

export function tehranDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** شروع روز جاری به وقت تهران */
export function tehranTodayStart(now = new Date()): Date {
  const key = tehranDayKey(now);
  return new Date(`${key}T00:00:00+03:30`);
}

/** سکه رایگان روزانه غیرفعال است */
export function canClaimDailyCoin(
  _lastDailyCoinAt: Date | null | undefined,
): boolean {
  return false;
}

export async function claimDailyCoin(_userId: number): Promise<
  | { ok: true; amount: number; balance: number }
  | { ok: false; reason: "no_user" | "already" | "disabled" }
> {
  return { ok: false, reason: "disabled" };
}

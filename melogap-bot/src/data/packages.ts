export type CoinPackage = {
  id: string;
  coins: number;
  toman: number;
  label: string;
};

/** پکیج‌های شبیه ملوگپ / هایپرگپ (تومان) */
export const COIN_PACKAGES: CoinPackage[] = [
  { id: "p100", coins: 100, toman: 50_000, label: "۱۰۰ سکه" },
  { id: "p250", coins: 250, toman: 120_000, label: "۲۵۰ سکه" },
  { id: "p520", coins: 520, toman: 240_000, label: "۵۲۰ سکه — پرفروش" },
  { id: "p1100", coins: 1100, toman: 450_000, label: "۱۱۰۰ سکه" },
  { id: "p2500", coins: 2500, toman: 900_000, label: "۲۵۰۰ سکه" },
  { id: "p5000", coins: 5000, toman: 1_700_000, label: "۵۰۰۰ سکه — ویژه" },
];

export const REFERRAL_BONUS = 50;
export const NEARBY_RADIUS_KM = 50;
export const NEARBY_LIMIT = 10;

export function formatToman(n: number): string {
  return n.toLocaleString("fa-IR") + " تومان";
}

export function formatCoins(n: number): string {
  return n.toLocaleString("fa-IR");
}

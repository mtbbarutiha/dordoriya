export type DiamondPackage = {
  id: string;
  diamonds: number;
  toman: number;
  label: string;
};

/** پکیج الماس شبیه ربات‌های دیتینگ ایرانی */
export const DIAMOND_PACKAGES: DiamondPackage[] = [
  { id: "d50", diamonds: 50, toman: 49_000, label: "۵۰ الماس" },
  { id: "d120", diamonds: 120, toman: 99_000, label: "۱۲۰ الماس" },
  { id: "d300", diamonds: 300, toman: 219_000, label: "۳۰۰ الماس — پرفروش" },
  { id: "d700", diamonds: 700, toman: 449_000, label: "۷۰۰ الماس" },
  { id: "d1500", diamonds: 1500, toman: 890_000, label: "۱۵۰۰ الماس" },
  { id: "d4000", diamonds: 4000, toman: 1_990_000, label: "۴۰۰۰ الماس — ویژه" },
];

export const REFERRAL_BONUS = 30;
export const WELCOME_DIAMONDS = 15;
export const BOOST_COST = 40;
export const BOOST_HOURS = 12;
export const FACE_VERIFY_COST = 11;
export const NEARBY_RADIUS_KM = 80;
export const EXPLORE_LIMIT = 1;

export function formatToman(n: number): string {
  return n.toLocaleString("fa-IR") + " تومان";
}

export function formatNum(n: number): string {
  return n.toLocaleString("fa-IR");
}

export function genderLabel(g: string | null | undefined): string {
  if (g === "female") return "خانم";
  if (g === "male") return "آقا";
  return "نامشخص";
}

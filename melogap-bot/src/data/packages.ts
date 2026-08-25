export type DiamondPackage = {
  id: string;
  diamonds: number;
  toman: number;
  label: string;
};

/** پکیج سکه شبیه ربات‌های دیتینگ ایرانی */
export const DIAMOND_PACKAGES: DiamondPackage[] = [
  { id: "d50", diamonds: 50, toman: 49_000, label: "۵۰ سکه" },
  { id: "d120", diamonds: 120, toman: 99_000, label: "۱۲۰ سکه" },
  { id: "d300", diamonds: 300, toman: 219_000, label: "۳۰۰ سکه — پرفروش" },
  { id: "d700", diamonds: 700, toman: 449_000, label: "۷۰۰ سکه" },
  { id: "d1500", diamonds: 1500, toman: 890_000, label: "۱۵۰۰ سکه" },
  { id: "d4000", diamonds: 4000, toman: 1_990_000, label: "۴۰۰۰ سکه — ویژه" },
];

export const REFERRAL_BONUS = 30;
export const WELCOME_DIAMONDS = 15;
export const BOOST_COST = 40;
export const BOOST_HOURS = 12;
/** جایزه تأیید احراز چهره (ویدیو مطابق عکس پروفایل) */
export const FACE_VERIFY_REWARD = 100;
/** هر لایک: ۱ سکه از لایک‌کننده → هدیه به طرف مقابل */
export const LIKE_GIFT_DIAMONDS = 1;
/** بسته‌های هدیه سکه به کاربر دیگر (از موجودی خودت) */
export const GIFT_AMOUNTS = [10, 50, 100, 200] as const;
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

import { Keyboard, InlineKeyboard } from "grammy";
import { DIAMOND_PACKAGES, formatToman } from "../data/packages.js";
import {
  LANGUAGES,
  COUNTRIES,
  provincesForCountry,
  citiesFor,
  iranRegions,
  provincesInRegion,
} from "../data/locations.js";

export const BTN = {
  PROFILE: "👤 پروفایل من",
  EXPLORE: "🎡 اکسپلور",
  ANON: "🕵️ پیام ناشناس",
  QUICK_CHAT: "⚡ چت سریع",
  BOOST: "🚀 شتاب‌دهی",
  DIAMONDS: "💎 الماس‌ها",
  PRO: "🅿️ اشتراک پرو",
  MORE: "📋 بیشتر",
  STATS: "📊 آمار",
  BACK: "↩️ بازگشت به منو",
  CANCEL_WAIT: "❌ لغو جستجو",
  END_CHAT: "🔚 قطع چت",
  SEND_LOCATION: "📍 ارسال موقعیت",
} as const;

export const REG = {
  LANG_FA: "🇮🇷 فارسی",
  LANG_EN: "🇬🇧 English",
  GENDER_F: "👩 خانم",
  GENDER_M: "👨 آقا",
  LOOK_F: "👩 خانم",
  LOOK_M: "👨 آقا",
  LOOK_ANY: "🎲 هردو",
  AGE_BACK: "↩️ بازه سن",
  REGION_BACK: "↩️ مناطق",
} as const;

/** بازه‌های سن — دکمه‌های درشت، بعد انتخاب سن دقیق */
export const AGE_RANGES: { label: string; from: number; to: number }[] = [
  { label: "۱۸ تا ۲۴", from: 18, to: 24 },
  { label: "۲۵ تا ۳۱", from: 25, to: 31 },
  { label: "۳۲ تا ۳۸", from: 32, to: 38 },
  { label: "۳۹ تا ۴۵", from: 39, to: 45 },
  { label: "۴۶ تا ۵۲", from: 46, to: 52 },
  { label: "۵۳ تا ۶۰", from: 53, to: 60 },
];

export function mainKeyboard() {
  return new Keyboard()
    .text(BTN.PROFILE)
    .text(BTN.EXPLORE)
    .row()
    .text(BTN.ANON)
    .text(BTN.QUICK_CHAT)
    .row()
    .text(BTN.BOOST)
    .text(BTN.DIAMONDS)
    .text(BTN.PRO)
    .row()
    .text(BTN.MORE)
    .text(BTN.STATS)
    .resized()
    .persistent();
}

export function cancelKeyboard() {
  return new Keyboard().text(BTN.BACK).resized().persistent();
}

export function waitingKeyboard() {
  return new Keyboard()
    .text(BTN.CANCEL_WAIT)
    .row()
    .text(BTN.BACK)
    .resized()
    .persistent();
}

export function chattingKeyboard() {
  return new Keyboard().text(BTN.END_CHAT).resized().persistent();
}

export function locationKeyboard() {
  return new Keyboard()
    .requestLocation(BTN.SEND_LOCATION)
    .row()
    .text(BTN.BACK)
    .resized()
    .oneTime();
}

/**
 * ReplyKeyboard ثبت‌نام: ستون زیاد = اسکرول کمتر،
 * oneTime = بعد از انتخاب کیبورد جمع می‌شود تا مرحله بعد فول‌صفحه باشد.
 */
function gridReply(labels: string[], cols: number, oneTime = true) {
  const kb = new Keyboard();
  labels.forEach((label, i) => {
    kb.text(label);
    if ((i + 1) % cols === 0) kb.row();
  });
  if (labels.length % cols !== 0) kb.row();
  const built = kb.resized();
  return oneTime ? built.oneTime() : built.persistent();
}

export function languageReplyKeyboard() {
  return gridReply([REG.LANG_FA, REG.LANG_EN], 2);
}

export function countryReplyKeyboard() {
  // ۴ کشور در ۲×۲ — دکمه‌های پهن
  return gridReply(
    COUNTRIES.map((c) => c.label),
    2,
  );
}

export function provinceReplyKeyboard(country: string, region?: string) {
  if (country === "IR" && !region) {
    // مرحله منطقه: ۶ دکمه درشت در ۲ ستون
    return gridReply(iranRegions(), 2);
  }
  if (country === "IR" && region) {
    const list = provincesInRegion(region) ?? [];
    const cols = list.length <= 4 ? 2 : 3;
    const kb = gridReply(list, cols);
    kb.row().text(REG.REGION_BACK);
    return kb;
  }
  const list = provincesForCountry(country);
  const cols = list.length <= 6 ? 2 : 3;
  return gridReply(list, cols);
}

export function cityReplyKeyboard(country: string, province: string) {
  const list = citiesFor(country, province);
  const cols = list.length <= 4 ? 2 : list.length <= 9 ? 3 : 4;
  return gridReply(list, cols);
}

export function genderReplyKeyboard() {
  return gridReply([REG.GENDER_F, REG.GENDER_M], 2);
}

export function lookingReplyKeyboard() {
  // هر سه در یک سطر — دکمه‌های پهن، بدون اسکرول
  return gridReply([REG.LOOK_F, REG.LOOK_M, REG.LOOK_ANY], 3);
}

/** مرحله ۱ سن: فقط ۶ بازه بزرگ */
export function ageRangeReplyKeyboard() {
  return gridReply(
    AGE_RANGES.map((r) => r.label),
    2,
  );
}

/** مرحله ۲ سن: فقط سن‌های همان بازه — دکمه‌های درشت */
export function ageReplyKeyboard(from = 18, to = 60) {
  const ages: string[] = [];
  for (let a = from; a <= to; a++) ages.push(String(a));
  const cols = ages.length <= 4 ? 2 : ages.length <= 8 ? 4 : 5;
  const kb = gridReply(ages, cols);
  // اگر بازه کامل نیست، دکمه برگشت به بازه‌ها
  if (from > 18 || to < 60) {
    kb.row().text(REG.AGE_BACK);
  }
  return kb;
}

export function parseAgeRange(text: string) {
  return AGE_RANGES.find((r) => r.label === text) ?? null;
}

// --- سازگاری با کدهای قبلی (ویرایش پروفایل / ادمین) ---
export function registerGenderKeyboard() {
  return genderReplyKeyboard();
}

export function lookingForKeyboard() {
  return lookingReplyKeyboard();
}

export function agePickerKeyboard(_page = 0, _prefix = "reg") {
  return ageRangeReplyKeyboard();
}

export function languageKeyboard() {
  return languageReplyKeyboard();
}

export function countryKeyboard() {
  return countryReplyKeyboard();
}

export function provinceKeyboard(country: string, _page = 0) {
  return provinceReplyKeyboard(country);
}

export function cityKeyboard(country: string, province: string, _page = 0) {
  return cityReplyKeyboard(country, province);
}

export function diamondPackagesKeyboard() {
  const kb = new InlineKeyboard();
  for (const p of DIAMOND_PACKAGES) {
    kb.text(`💎 ${p.label} — ${formatToman(p.toman)}`, `buy:${p.id}`).row();
  }
  return kb;
}

export function paymentKeyboard(orderId: number, payUrl: string) {
  return new InlineKeyboard()
    .url("💳 پرداخت در مرورگر", payUrl)
    .row()
    .text("✅ پرداخت کردم", `paid:${orderId}`)
    .text("❌ انصراف", `cancel:${orderId}`);
}

export function exploreKeyboard(targetId: number) {
  return new InlineKeyboard()
    .text("❤️ لایک", `exp:like:${targetId}`)
    .text("⚡ چت", `exp:chat:${targetId}`)
    .row()
    .text("⏭️ بعدی", "exp:next")
    .text("✖️ رد", "exp:skip");
}

export function moreKeyboard() {
  return new InlineKeyboard()
    .text("📖 راهنما", "more:guide")
    .text("🎁 دعوت دوستان", "more:ref")
    .row()
    .text("🏘 هم‌استانی‌ها", "more:province")
    .text("📍 نزدیک‌های شهر", "more:nearby")
    .row()
    .text("🔗 لینک ناشناس من", "more:anonlink");
}

export function profilePanelKeyboard(isActive: boolean, faceVerified: boolean) {
  return new InlineKeyboard()
    .text("ویرایش پروفایل 📝", "prof:edit")
    .text("تکمیل پروفایل 🧾", "prof:complete")
    .row()
    .text("🔄 تعاملات", "prof:interactions")
    .row()
    .text("حذف/غیرفعال‌سازی ❌", "prof:manage")
    .text(
      faceVerified ? "احراز شده ✅" : "احراز چهره (+۱۰۰ 💎)",
      "prof:face",
    );
}

/** مقدمه احراز چهره — مثل دوردور */
export function faceVerifyIntroKeyboard() {
  return new InlineKeyboard()
    .text("بله، متوجه شدم", "face:ok")
    .row()
    .text("تغییر عکس پروفایل", "face:photo")
    .row()
    .text("انصراف", "face:cancel");
}

export function profileEditKeyboard() {
  return new InlineKeyboard()
    .text("📝 نام", "edit:name")
    .text("🎂 سن", "edit:age")
    .row()
    .text("📄 بیو", "edit:bio")
    .text("🎯 علاقه", "edit:looking")
    .row()
    .text("↩️ بازگشت به پروفایل", "prof:back");
}

export function confirmDeleteKeyboard() {
  return new InlineKeyboard()
    .text("🗑️ بله، حذف شود", "prof:delete:yes")
    .text("❌ خیر", "prof:delete:no");
}

export function accountManageKeyboard(isActive: boolean) {
  return new InlineKeyboard()
    .text(isActive ? "⏸️ غیرفعال‌سازی" : "▶️ فعال‌سازی", "prof:toggle")
    .row()
    .text("🗑️ حذف حساب", "prof:delete")
    .row()
    .text("↩️ بازگشت", "prof:back");
}

export function adminPhotoKeyboard(userId: number) {
  return new InlineKeyboard()
    .text("✅ تأیید عکس", `adm:photo:ok:${userId}`)
    .text("❌ رد عکس", `adm:photo:no:${userId}`);
}

export function adminFaceKeyboard(userId: number) {
  return new InlineKeyboard()
    .text("✅ تأیید احراز", `adm:face:ok:${userId}`)
    .text("❌ رد احراز", `adm:face:no:${userId}`);
}

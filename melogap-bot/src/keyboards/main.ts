import { Keyboard, InlineKeyboard } from "grammy";
import {
  DIAMOND_PACKAGES,
  GIFT_AMOUNTS,
  formatToman,
  formatNum,
} from "../data/packages.js";
import {
  LANGUAGES,
  COUNTRIES,
  provincesForCountry,
  citiesFor,
  iranRegions,
  provincesInRegion,
} from "../data/locations.js";
import { INTERESTS } from "../data/interests.js";

export const BTN = {
  /** اتصال تصادفی — دکمه اصلی تمام‌عرض مثل ملوگپ */
  QUICK_CHAT: "به یه ناشناس وصلم کن! 🙊",
  NEARBY: "افراد نزدیک 📍🛰️",
  SEARCH: "جستجو کاربران 🔍🗨️",
  GUIDE: "راهنما 🤔",
  PROFILE: "پروفایل 👤",
  DIAMONDS: "سکه 💰",
  REFERRAL: "معرفی به دوستان (سکه رایگان) 🔗",
  ANON_LINK: "لینک ناشناس من 🎭🎭",
  BACK: "↩️ بازگشت به منو",
  CANCEL_WAIT: "❌ لغو جستجو",
  END_CHAT: "🔚 قطع چت",
  SECURE_CHAT_ON: "🔒 چت امن",
  SECURE_CHAT_OFF: "🔓 خاموش کردن چت امن",
  SEND_LOCATION: "📍 ارسال موقعیت",
  /** سازگاری با کدهای قبلی */
  EXPLORE: "جستجو کاربران 🔍🗨️",
  ANON: "لینک ناشناس من 🎭🎭",
  BOOST: "🚀 شتاب‌دهی",
  PRO: "🅿️ اشتراک پرو",
  MORE: "راهنما 🤔",
  STATS: "📊 آمار",
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
  /** بازگشت به مرحله قبلی ثبت‌نام */
  STEP_BACK: "↩️ بازگشت به قبل",
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

/** منوی اصلی شبیه ملوگپ */
export function mainKeyboard() {
  return new Keyboard()
    .text(BTN.QUICK_CHAT)
    .row()
    .text(BTN.NEARBY)
    .text(BTN.SEARCH)
    .row()
    .text(BTN.GUIDE)
    .text(BTN.PROFILE)
    .text(BTN.DIAMONDS)
    .row()
    .text(BTN.REFERRAL)
    .row()
    .text(BTN.ANON_LINK)
    .resized()
    .persistent();
}

/** پنل جستجو — دکمه‌های اینلاین شبیه ملوگپ */
export function searchPanelKeyboard() {
  return new InlineKeyboard()
    .text("به مخاطب خاصم وصلم کن 💌", "search:special")
    .row()
    .text("هم استانی ها 📍🍷", "search:province")
    .text("هم سن ها 👤👥", "search:age")
    .row()
    .text("📋 مشاهده همه", "search:all")
    .row()
    .text("جستجو پیشرفته 🔍", "search:advanced")
    .row()
    .text("کاربران جدید 🙋‍♀️💁‍♂️", "search:new")
    .text("بدون چت ها 🚶‍♂️🚶‍♀️", "search:nochats")
    .row()
    .text("👀 چت های اخیر من 👀", "search:recent")
    .row()
    .text("جستجو با GPS فعلی من 📍", "search:gps")
    .row()
    .text("کاربران محبوب بر اساس لایک 📊❤️", "search:popular");
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

export function chattingKeyboard(secure = false) {
  return new Keyboard()
    .text(BTN.END_CHAT)
    .row()
    .text(secure ? BTN.SECURE_CHAT_OFF : BTN.SECURE_CHAT_ON)
    .resized()
    .persistent();
}

export function locationKeyboard() {
  return new Keyboard()
    .requestLocation(BTN.SEND_LOCATION)
    .row()
    .text(BTN.BACK)
    .resized()
    .oneTime();
}

/** لوکیشن اجباری در ثبت‌نام — با بازگشت به مرحله قبل */
export function regLocationKeyboard() {
  return new Keyboard()
    .requestLocation("📍 ارسال موقعیت من")
    .row()
    .text(REG.STEP_BACK)
    .resized()
    .oneTime();
}

/** فقط بازگشت — مرحله نام نمایشی */
export function regNameKeyboard() {
  return new Keyboard().text(REG.STEP_BACK).resized().persistent();
}

/** ویرایش لوکیشن از پروفایل */
export function editLocationKeyboard() {
  return new Keyboard()
    .requestLocation("📍 به‌روزرسانی موقعیت")
    .row()
    .text(BTN.BACK)
    .resized()
    .oneTime();
}

/**
 * ReplyKeyboard ثبت‌نام: ستون زیاد = اسکرول کمتر،
 * oneTime = بعد از انتخاب کیبورد جمع می‌شود تا مرحله بعد فول‌صفحه باشد.
 */
function gridReply(
  labels: string[],
  cols: number,
  opts: { oneTime?: boolean; stepBack?: boolean } | boolean = true,
) {
  // سازگاری با فراخوانی قدیمی gridReply(labels, cols, oneTime?)
  const normalized =
    typeof opts === "boolean" ? { oneTime: opts, stepBack: false } : opts;
  const oneTime = normalized.oneTime ?? true;
  const stepBack = normalized.stepBack ?? false;
  const kb = new Keyboard();
  labels.forEach((label, i) => {
    kb.text(label);
    if ((i + 1) % cols === 0) kb.row();
  });
  if (labels.length % cols !== 0) kb.row();
  if (stepBack) kb.text(REG.STEP_BACK).row();
  const built = kb.resized();
  return oneTime ? built.oneTime() : built.persistent();
}

export function languageReplyKeyboard() {
  return gridReply([REG.LANG_FA, REG.LANG_EN], 2);
}

export function countryReplyKeyboard(stepBack = true) {
  return gridReply(COUNTRIES.map((c) => c.label), 2, { stepBack });
}

export function provinceReplyKeyboard(
  country: string,
  region?: string,
  stepBack = true,
) {
  if (country === "IR" && !region) {
    return gridReply(iranRegions(), 2, { stepBack });
  }
  if (country === "IR" && region) {
    const list = provincesInRegion(region) ?? [];
    const cols = list.length <= 4 ? 2 : 3;
    const kb = gridReply(list, cols, { stepBack: false });
    kb.row().text(REG.REGION_BACK);
    if (stepBack) kb.row().text(REG.STEP_BACK);
    return kb;
  }
  const list = provincesForCountry(country);
  const cols = list.length <= 6 ? 2 : 3;
  return gridReply(list, cols, { stepBack });
}

export function cityReplyKeyboard(
  country: string,
  province: string,
  stepBack = true,
) {
  const list = citiesFor(country, province);
  const cols = list.length <= 4 ? 2 : list.length <= 9 ? 3 : 4;
  return gridReply(list, cols, { stepBack });
}

export function genderReplyKeyboard(stepBack = false) {
  return gridReply([REG.GENDER_F, REG.GENDER_M], 2, { stepBack });
}

export function lookingReplyKeyboard(stepBack = false) {
  return gridReply([REG.LOOK_F, REG.LOOK_M, REG.LOOK_ANY], 3, { stepBack });
}

/** مرحله ۱ سن: فقط ۶ بازه بزرگ */
export function ageRangeReplyKeyboard(stepBack = false) {
  return gridReply(AGE_RANGES.map((r) => r.label), 2, { stepBack });
}

/** مرحله ۲ سن: فقط سن‌های همان بازه — دکمه‌های درشت */
export function ageReplyKeyboard(from = 18, to = 60, stepBack = false) {
  const ages: string[] = [];
  for (let a = from; a <= to; a++) ages.push(String(a));
  const cols = ages.length <= 4 ? 2 : ages.length <= 8 ? 4 : 5;
  const kb = gridReply(ages, cols, { stepBack: false });
  if (from > 18 || to < 60) {
    kb.row().text(REG.AGE_BACK);
  }
  if (stepBack) kb.row().text(REG.STEP_BACK);
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
    kb.text(`🪙 ${p.label} — ${formatToman(p.toman)}`, `buy:${p.id}`).row();
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

export function exploreKeyboard(targetId: number, likesCount: number) {
  return new InlineKeyboard()
    .text(`❤️ ${formatNum(likesCount)}`, `exp:likes:${targetId}`)
    .row()
    .text("🎁 هدیه سکه", `gift:menu:${targetId}`)
    .row()
    .text(`❤️ لایک (+۱🪙)`, `exp:like:${targetId}`)
    .text("💬 درخواست چت", `exp:chat:${targetId}`);
}

/** دکمه‌های زیر لیست سرچ */
export function searchListFooterKeyboard(optsKey = "default") {
  return new InlineKeyboard()
    .text("📋 مشاهده همه", `search:viewall:${optsKey}`)
    .row()
    .text("⏭️ بعدی", `search:next:${optsKey}`)
    .text("✖️ رد", `search:skip:${optsKey}`);
}

/** انتخاب مقدار هدیه سکه به کاربر دیگر */
export function giftDiamondsKeyboard(targetId: number) {
  const kb = new InlineKeyboard();
  for (const n of GIFT_AMOUNTS) {
    kb.text(`🎁 ${formatNum(n)} سکه`, `gift:send:${targetId}:${n}`).row();
  }
  kb.text("↩️ بازگشت", `gift:back:${targetId}`);
  return kb;
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

export function profilePanelKeyboard(
  isActive: boolean,
  faceVerified: boolean,
  likesCount: number,
) {
  return new InlineKeyboard()
    .text(`❤️ ${formatNum(likesCount)}`, "prof:likes")
    .row()
    .text("ویرایش پروفایل 📝", "prof:edit")
    .text("تکمیل پروفایل 🧾", "prof:complete")
    .row()
    .text("🔄 تعاملات", "prof:interactions")
    .text(
      faceVerified ? "احراز شده ✅" : "احراز چهره (+۱۰۰ 🪙)",
      "prof:face",
    )
    .row()
    .text("🔴 حذف / غیرفعال‌سازی حساب", "prof:manage");
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
    .text("⚧ جنسیت", "edit:gender")
    .text("🎯 علاقه (جستجو)", "edit:looking")
    .row()
    .text("📄 بیو", "edit:bio")
    .text("✨ علاقه‌مندی‌ها", "edit:interests")
    .row()
    .text("📍 موقعیت", "edit:location")
    .text("📷 عکس", "edit:photo")
    .row()
    .text("↩️ بازگشت به پروفایل", "prof:back");
}

export function interestsKeyboard(selected: string[]) {
  const sel = new Set(selected);
  const kb = new InlineKeyboard();
  INTERESTS.forEach((item, i) => {
    const mark = sel.has(item.id) ? "✅ " : "";
    kb.text(`${mark}${item.label}`, `interest:toggle:${item.id}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (INTERESTS.length % 2 !== 0) kb.row();
  kb.text("💾 ذخیره", "interest:save").text("↩️ انصراف", "interest:cancel");
  return kb;
}

export function confirmDeleteKeyboard() {
  return new InlineKeyboard()
    .text("🔴🗑 بله، حسابم حذف شود", "prof:delete:yes")
    .row()
    .text("❌ خیر، منصرف شدم", "prof:delete:no");
}

export function accountManageKeyboard(isActive: boolean) {
  return new InlineKeyboard()
    .text(
      isActive
        ? "🔴⏸ غیرفعال‌سازی حساب"
        : "🟢▶️ فعال‌سازی حساب",
      "prof:toggle",
    )
    .row()
    .text("🔴🗑 حذف دائمی حساب", "prof:delete")
    .row()
    .text("↩️ بازگشت به پروفایل", "prof:back");
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

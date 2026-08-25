import { Keyboard, InlineKeyboard } from "grammy";
import { DIAMOND_PACKAGES, formatToman } from "../data/packages.js";
import {
  LANGUAGES,
  COUNTRIES,
  provincesForCountry,
  citiesFor,
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

export function registerGenderKeyboard() {
  return new InlineKeyboard()
    .text("👩 خانم", "reg:gender:female")
    .text("👨 آقا", "reg:gender:male");
}

export function lookingForKeyboard() {
  return new InlineKeyboard()
    .text("👩 خانم", "reg:looking:female")
    .text("👨 آقا", "reg:looking:male")
    .row()
    .text("🎲 فرقی ندارد", "reg:looking:any");
}

export function agePickerKeyboard(page = 0, prefix = "reg") {
  const minAge = 18;
  const maxAge = 60;
  const perPage = 12;
  const ages: number[] = [];
  for (let a = minAge; a <= maxAge; a++) ages.push(a);

  const totalPages = Math.ceil(ages.length / perPage);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = ages.slice(safePage * perPage, safePage * perPage + perPage);

  const kb = new InlineKeyboard();
  slice.forEach((age, i) => {
    kb.text(String(age), `${prefix}:age:${age}`);
    if ((i + 1) % 4 === 0) kb.row();
  });
  if (slice.length % 4 !== 0) kb.row();

  if (safePage > 0) kb.text("◀️ قبلی", `${prefix}:agepage:${safePage - 1}`);
  kb.text(`${safePage + 1}/${totalPages}`, `${prefix}:agenoop`);
  if (safePage < totalPages - 1) {
    kb.text("بعدی ▶️", `${prefix}:agepage:${safePage + 1}`);
  }
  return kb;
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

/** پنل پروفایل منسجم شبیه DorDor */
export function profilePanelKeyboard(isActive: boolean) {
  return new InlineKeyboard()
    .text("✏️ ویرایش", "prof:edit")
    .text("💬 تعاملات", "prof:interactions")
    .row()
    .text("📷 عکس پروفایل", "prof:photo")
    .text("✅ احراز چهره", "prof:face")
    .row()
    .text(isActive ? "⏸️ غیرفعال‌سازی" : "▶️ فعال‌سازی", "prof:toggle")
    .text("🗑️ حذف حساب", "prof:delete")
    .row()
    .text("↩️ بستن", "prof:close");
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

export function languageKeyboard() {
  const kb = new InlineKeyboard();
  for (const l of LANGUAGES) {
    kb.text(l.label, `reg:lang:${l.id}`);
  }
  return kb;
}

export function countryKeyboard() {
  const kb = new InlineKeyboard();
  COUNTRIES.forEach((c, i) => {
    kb.text(c.label, `reg:country:${c.id}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  return kb;
}

export function provinceKeyboard(country: string, page = 0) {
  const list = provincesForCountry(country);
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil(list.length / perPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = list.slice(safePage * perPage, safePage * perPage + perPage);

  const kb = new InlineKeyboard();
  slice.forEach((name, i) => {
    // index-based callback to avoid long Persian in callback_data limits
    const idx = safePage * perPage + i;
    kb.text(name, `reg:prov:${idx}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (slice.length % 2 !== 0) kb.row();

  if (safePage > 0) kb.text("◀️ قبلی", `reg:provpage:${safePage - 1}`);
  kb.text(`${safePage + 1}/${totalPages}`, "reg:noop");
  if (safePage < totalPages - 1) kb.text("بعدی ▶️", `reg:provpage:${safePage + 1}`);
  return kb;
}

export function cityKeyboard(country: string, province: string, page = 0) {
  const list = citiesFor(country, province);
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil(list.length / perPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = list.slice(safePage * perPage, safePage * perPage + perPage);

  const kb = new InlineKeyboard();
  slice.forEach((name, i) => {
    const idx = safePage * perPage + i;
    kb.text(name, `reg:city:${idx}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (slice.length % 2 !== 0) kb.row();

  if (safePage > 0) kb.text("◀️ قبلی", `reg:citypage:${safePage - 1}`);
  kb.text(`${safePage + 1}/${totalPages}`, "reg:noop");
  if (safePage < totalPages - 1) kb.text("بعدی ▶️", `reg:citypage:${safePage + 1}`);
  return kb;
}

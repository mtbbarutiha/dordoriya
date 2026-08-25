import { Keyboard, InlineKeyboard } from "grammy";
import { DIAMOND_PACKAGES, formatToman } from "../data/packages.js";

export const BTN = {
  PROFILE: "پروفایل من 👤",
  EXPLORE: "اکسپلور 🎡",
  ANON: "پیام ناشناس 🕵️‍♂️",
  QUICK_CHAT: "چت سریع ⚡",
  BOOST: "شتاب‌دهی 🚀",
  DIAMONDS: "الماس‌ها 💎",
  PRO: "اشتراک پرو 🅿️",
  MORE: "بیشتر 📋",
  STATS: "آمار 📊",
  BACK: "بازگشت به منو ↩️",
  CANCEL_WAIT: "لغو جستجو ❌",
  END_CHAT: "قطع چت",
  SEND_LOCATION: "ارسال موقعیت 📍",
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
    .text("خانم 👩", "reg:gender:female")
    .text("آقا 👨", "reg:gender:male");
}

export function lookingForKeyboard() {
  return new InlineKeyboard()
    .text("خانم 👩", "reg:looking:female")
    .text("آقا 👨", "reg:looking:male")
    .row()
    .text("فرقی ندارد 🎲", "reg:looking:any");
}

export function diamondPackagesKeyboard() {
  const kb = new InlineKeyboard();
  for (const p of DIAMOND_PACKAGES) {
    kb.text(`${p.label} — ${formatToman(p.toman)}`, `buy:${p.id}`).row();
  }
  return kb;
}

export function paymentKeyboard(orderId: number, payUrl: string) {
  return new InlineKeyboard()
    .url("پرداخت در مرورگر 💳", payUrl)
    .row()
    .text("پرداخت کردم ✅", `paid:${orderId}`)
    .text("انصراف", `cancel:${orderId}`);
}

export function exploreKeyboard(targetId: number) {
  return new InlineKeyboard()
    .text("❤️ لایک", `exp:like:${targetId}`)
    .text("چت ⚡", `exp:chat:${targetId}`)
    .row()
    .text("بعدی ⏭️", "exp:next")
    .text("رد کردن", "exp:skip");
}

export function moreKeyboard() {
  return new InlineKeyboard()
    .text("راهنما 📖", "more:guide")
    .text("دعوت دوستان 🎁", "more:ref")
    .row()
    .text("نزدیک‌های شهر 📍", "more:nearby")
    .text("ویرایش پروفایل ✏️", "more:edit")
    .row()
    .text("لینک پیام ناشناس من 🔗", "more:anonlink");
}

export function profileEditKeyboard() {
  return new InlineKeyboard()
    .text("تغییر نام", "edit:name")
    .text("تغییر سن", "edit:age")
    .row()
    .text("تغییر بیو", "edit:bio")
    .text("تغییر علاقه", "edit:looking")
    .row()
    .text("ارسال عکس پروفایل", "edit:photo");
}

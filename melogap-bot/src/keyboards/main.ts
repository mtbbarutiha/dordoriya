import { Keyboard, InlineKeyboard } from "grammy";
import { COIN_PACKAGES, formatToman } from "../data/packages.js";

export const BTN = {
  CONNECT: "بزن بریم ناشناس ⚡",
  NEARBY: "نزدیکای شهر 📍",
  SEARCH: "فیلتر هوشمند 🎯",
  GUIDE: "چطور کار می‌کنه؟",
  PROFILE: "هویت من 🪪",
  COINS: "کیف سکه 🪙",
  REFERRAL: "دعوت کن، سکه بگیر 🎁",
  ANON_LINK: "صندوق ناشناس من 🎭",
  SEND_LOCATION: "ارسال موقعیت 📍",
  CANCEL_WAIT: "لغو جستجو ❌",
  END_CHAT: "قطع چت /end",
  BACK: "بازگشت به منو ↩️",
} as const;

export function mainKeyboard() {
  return new Keyboard()
    .text(BTN.CONNECT)
    .row()
    .text(BTN.NEARBY)
    .text(BTN.SEARCH)
    .row()
    .text(BTN.GUIDE)
    .text(BTN.PROFILE)
    .text(BTN.COINS)
    .row()
    .text(BTN.REFERRAL)
    .row()
    .text(BTN.ANON_LINK)
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

export function waitingKeyboard() {
  return new Keyboard()
    .text(BTN.CANCEL_WAIT)
    .row()
    .text(BTN.BACK)
    .resized()
    .persistent();
}

export function chattingKeyboard() {
  return new Keyboard()
    .text(BTN.END_CHAT)
    .resized()
    .persistent();
}

export function coinPackagesKeyboard() {
  const kb = new InlineKeyboard();
  for (const p of COIN_PACKAGES) {
    kb.text(
      `${p.label} — ${formatToman(p.toman)}`,
      `buy:${p.id}`,
    ).row();
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

export function nearbyUserKeyboard(targetUserId: number) {
  return new InlineKeyboard()
    .text("چت ناشناس با این نفر ⚡", `nearby_chat:${targetUserId}`)
    .row()
    .text("رد کردن", "nearby_skip");
}

export function genderFilterKeyboard() {
  return new InlineKeyboard()
    .text("خانم 👩", "gender:female")
    .text("آقا 👨", "gender:male")
    .row()
    .text("فرقی نداره 🎲", "gender:any");
}

export function profileGenderKeyboard() {
  return new InlineKeyboard()
    .text("خانم 👩", "setgender:female")
    .text("آقا 👨", "setgender:male");
}

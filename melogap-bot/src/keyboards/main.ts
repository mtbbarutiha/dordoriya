import { Keyboard } from "grammy";

export const BTN = {
  CONNECT: "بزن بریم ناشناس ⚡",
  NEARBY: "نزدیکای شهر 📍",
  SEARCH: "فیلتر هوشمند 🎯",
  GUIDE: "چطور کار می‌کنه؟",
  PROFILE: "هویت من 🪪",
  COINS: "کیف سکه 🪙",
  REFERRAL: "دعوت کن، سکه بگیر 🎁",
  ANON_LINK: "صندوق ناشناس من 🎭",
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

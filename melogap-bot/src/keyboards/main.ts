import { Keyboard } from "grammy";

export const BTN = {
  CONNECT: "به یه ناشناس وصلم کن! 🙈",
  NEARBY: "افراد نزدیک 📍🛰️",
  SEARCH: "جستجو کاربران 🔍🗨️",
  GUIDE: "راهنما 🤔",
  PROFILE: "پروفایل 👤",
  COINS: "سکه 💰",
  REFERRAL: "معرفی به دوستان (سکه رایگان) 🔗",
  ANON_LINK: "لینک ناشناس من 🎭",
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

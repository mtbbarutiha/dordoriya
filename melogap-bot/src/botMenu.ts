import type { Bot } from "grammy";

/** دستورهای منوی تلگرام (دکمه Menu کنار کادر پیام) */
export const BOT_COMMANDS = [
  { command: "menu", description: "📋 منوی اصلی" },
  { command: "chat", description: "🙊 وصل به ناشناس" },
  { command: "explore", description: "🔍 جستجو کاربران" },
  { command: "profile", description: "👤 پروفایل" },
  { command: "diamonds", description: "💰 سکه" },
  { command: "anon", description: "🎭 لینک ناشناس من" },
  { command: "boost", description: "🚀 شتاب‌دهی" },
  { command: "pro", description: "🅿️ اشتراک پرو" },
  { command: "stats", description: "📊 آمار" },
  { command: "admin", description: "🛠 پنل ادمین" },
  { command: "start", description: "🔄 شروع / ثبت‌نام" },
  { command: "end", description: "🔚 قطع چت" },
] as const;

export async function setupBotMenu(bot: Bot) {
  await bot.api.setMyCommands([...BOT_COMMANDS]);
  await bot.api.setChatMenuButton({
    menu_button: { type: "commands" },
  });
}

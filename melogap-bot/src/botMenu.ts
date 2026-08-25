import type { Bot } from "grammy";

/** دستورهای منوی تلگرام (دکمه Menu کنار کادر پیام) */
export const BOT_COMMANDS = [
  { command: "menu", description: "📋 منوی اصلی" },
  { command: "profile", description: "👤 پروفایل من" },
  { command: "explore", description: "🎡 اکسپلور" },
  { command: "chat", description: "⚡ چت سریع" },
  { command: "anon", description: "🕵️ پیام ناشناس" },
  { command: "diamonds", description: "🪙 سکه‌ها" },
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

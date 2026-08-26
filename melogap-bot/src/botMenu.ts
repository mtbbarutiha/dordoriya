import type { Bot } from "grammy";
import { getAdminIds } from "./lib/admin.js";

/** دستورهای منوی عمومی کاربران (بدون ادمین) */
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
  { command: "start", description: "🔄 شروع / ثبت‌نام" },
  { command: "end", description: "🔚 قطع چت" },
] as const;

/** فقط برای ادمین — در منوی چت ادمین دیده می‌شود */
export const ADMIN_COMMANDS = [
  ...BOT_COMMANDS,
  { command: "admin", description: "🛠 پنل ادمین" },
] as const;

export async function setupBotMenu(bot: Bot) {
  // منوی پیش‌فرض همه کاربران — بدون ادمین
  await bot.api.setMyCommands([...BOT_COMMANDS]);
  await bot.api.setChatMenuButton({
    menu_button: { type: "commands" },
  });

  // منوی اختصاصی ادمین‌ها
  for (const adminId of getAdminIds()) {
    try {
      await bot.api.setMyCommands([...ADMIN_COMMANDS], {
        scope: { type: "chat", chat_id: adminId },
      });
    } catch (err) {
      console.error("setMyCommands for admin failed", adminId, err);
    }
  }
}

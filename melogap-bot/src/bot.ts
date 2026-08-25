import { Bot } from "grammy";
import { startHandler, registerHandler } from "./handlers/start.js";
import { commandsHandler } from "./handlers/commands.js";
import { menuHandler } from "./handlers/menu.js";
import { featuresHandler } from "./handlers/features.js";
import { profileHandler } from "./handlers/profile.js";
import { adminHandler } from "./handlers/admin.js";
import { chatHandler } from "./handlers/chat.js";
import { fallbackHandler } from "./handlers/fallback.js";

export function createBot(token: string) {
  const bot = new Bot(token);

  bot.use(startHandler);
  bot.use(adminHandler);
  bot.use(commandsHandler);
  bot.use(registerHandler);
  bot.use(profileHandler);
  bot.use(featuresHandler);
  bot.use(menuHandler);
  bot.use(chatHandler);
  bot.use(fallbackHandler);

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  return bot;
}

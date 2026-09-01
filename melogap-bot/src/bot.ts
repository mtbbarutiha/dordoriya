import { Bot } from "grammy";
import { startHandler } from "./handlers/start.js";
import { menuHandler } from "./handlers/menu.js";

export function createBot(token: string) {
  const bot = new Bot(token);

  bot.use(startHandler);
  bot.use(menuHandler);

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  return bot;
}

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

  bot.use(async (ctx, next) => {
    const kind = ctx.callbackQuery
      ? "callback"
      : ctx.message
        ? "message"
        : "update";
    const hint = ctx.callbackQuery?.data
      ? ` data=${ctx.callbackQuery.data.slice(0, 40)}`
      : ctx.message && "text" in ctx.message && ctx.message.text
        ? ` text=${JSON.stringify(ctx.message.text.slice(0, 40))}`
        : "";
    console.log(`[update] ${kind} from=${ctx.from?.id ?? "-"}${hint}`);
    try {
      await next();
    } catch (err) {
      console.error(
        `[handler] failed from=${ctx.from?.id ?? "-"}:`,
        err instanceof Error ? err.stack ?? err.message : err,
      );
      throw err;
    }
  });

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
    const e = err.error;
    console.error(
      "Bot error:",
      e instanceof Error ? e.stack ?? e.message : e,
    );
  });

  return bot;
}

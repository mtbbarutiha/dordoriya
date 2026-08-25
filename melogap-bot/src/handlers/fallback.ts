import { Composer } from "grammy";
import { mainKeyboard } from "../keyboards/main.js";
import { findByTelegram } from "../db/users.js";
import { beginRegistration } from "../services/register.js";

export const fallbackHandler = new Composer();

fallbackHandler.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  const from = ctx.from;
  if (!from) return;
  const user = await findByTelegram(from.id);
  if (!user || !user.registered) {
    if (user) await beginRegistration(ctx, user.id);
    else await ctx.reply("لطفاً /start را بزن.");
    return;
  }
  await ctx.reply("منوی اصلی — یک دکمه را انتخاب کن:", {
    reply_markup: mainKeyboard(),
  });
});

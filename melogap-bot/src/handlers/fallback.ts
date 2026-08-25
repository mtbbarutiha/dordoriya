import { Composer } from "grammy";
import { mainKeyboard } from "../keyboards/main.js";

export const fallbackHandler = new Composer();

fallbackHandler.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  await ctx.reply(
    "منوی دودوریا اینجاست 👇\nیکی از دکمه‌ها رو بزن یا /start بزن.",
    { reply_markup: mainKeyboard() },
  );
});

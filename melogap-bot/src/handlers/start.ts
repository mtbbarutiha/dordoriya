import { Composer } from "grammy";
import { upsertUser } from "../db/users.js";
import { mainKeyboard } from "../keyboards/main.js";

export const startHandler = new Composer();

startHandler.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const payload = ctx.match?.trim() || undefined;
  const referralCodeFromStart = payload?.startsWith("ref_")
    ? payload.slice(4)
    : payload;

  await upsertUser({
    telegramId: from.id,
    ...(from.username ? { username: from.username } : {}),
    ...(from.first_name ? { firstName: from.first_name } : {}),
    ...(referralCodeFromStart
      ? { referralCodeFromStart }
      : {}),
  });

  await ctx.reply(
    [
      "سلام به دودوریا 🌑",
      "یه ناشناس، یه حرف واقعی.",
      "",
      "اینجا اسمت مهم نیست؛ حرفت مهمه.",
      "یه دکمه بزن و وارد فضای ناشناس شو.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

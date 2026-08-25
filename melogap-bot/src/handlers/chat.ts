import { Composer } from "grammy";
import { getByTelegramId, setState } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import { mainKeyboard } from "../keyboards/main.js";
import { BTN } from "../keyboards/main.js";

export const chatHandler = new Composer();

const MENU_TEXTS = new Set<string>(Object.values(BTN));

chatHandler.on("message:text", async (ctx, next) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return next();
  if (MENU_TEXTS.has(text)) return next();

  const from = ctx.from;
  if (!from) return next();

  const user = await getByTelegramId(from.id);
  if (!user) return next();

  // پیام ناشناس به صندوق
  if (user.state === "await_anon_msg" && user.pendingAnonTo) {
    const target = await prisma.user.findUnique({
      where: { anonCode: user.pendingAnonTo },
    });
    if (!target) {
      await setState(user.id, "idle", { pendingAnonTo: null });
      await ctx.reply("صاحب صندوق پیدا نشد.", { reply_markup: mainKeyboard() });
      return;
    }

    await prisma.anonMessage.create({
      data: {
        toUserId: target.id,
        fromUserId: user.id,
        text,
      },
    });

    await ctx.api.sendMessage(
      Number(target.telegramId),
      [
        "🎭 پیام ناشناس جدید!",
        "",
        text,
        "",
        "برای ساخت لینک خودت: صندوق ناشناس من",
      ].join("\n"),
    );

    await setState(user.id, "idle", { pendingAnonTo: null });
    await ctx.reply("پیامت ناشناس ارسال شد ✅", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  // رله چت ناشناس
  if (user.state === "chatting" && user.chatPartnerId) {
    const partner = await prisma.user.findUnique({
      where: { id: user.chatPartnerId },
    });
    if (!partner || partner.state !== "chatting") {
      await setState(user.id, "idle", { chatPartnerId: null });
      await ctx.reply("چت قطع شده.", { reply_markup: mainKeyboard() });
      return;
    }
    await ctx.api.sendMessage(
      Number(partner.telegramId),
      `👤 ناشناس:\n${text}`,
    );
    return;
  }

  return next();
});

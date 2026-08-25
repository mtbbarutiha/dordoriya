import { Composer } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import { BTN, mainKeyboard } from "../keyboards/main.js";

export const chatHandler = new Composer();

const MENU = new Set<string>(Object.values(BTN));

chatHandler.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();
  if (MENU.has(text)) return next();

  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user) return next();

  // ویرایش پروفایل
  if (user.state === "edit_name") {
    if (text.length < 2 || text.length > 24) {
      await ctx.reply("نام باید ۲ تا ۲۴ حرف باشد.");
      return;
    }
    await patchUser(user.id, { displayName: text, state: "idle" });
    await ctx.reply("نام به‌روز شد ✅", { reply_markup: mainKeyboard() });
    return;
  }
  if (user.state === "edit_bio") {
    if (text.length > 150) {
      await ctx.reply("بیو حداکثر ۱۵۰ حرف.");
      return;
    }
    await patchUser(user.id, { bio: text, state: "idle" });
    await ctx.reply("بیو ذخیره شد ✅", { reply_markup: mainKeyboard() });
    return;
  }

  if (user.state === "await_special") {
    let code = text.trim();
    const m = code.match(/anon_([a-zA-Z0-9]+)/);
    if (m) code = m[1]!;
    else if (code.startsWith("anon_")) code = code.slice(5);

    const target = await prisma.user.findUnique({ where: { anonCode: code } });
    if (!target || target.deletedAt || target.id === user.id) {
      await ctx.reply(
        "مخاطب پیدا نشد. لینک یا کد ناشناس درست را بفرست، یا بازگشت بزن.",
      );
      return;
    }
    const { connectUsers } = await import("../services/match.js");
    const result = await connectUsers(ctx.api, user.id, target.id);
    if (result === "demo") {
      await patchUser(user.id, { state: "idle" });
      await ctx.reply("این پروفایل نمونه است.", { reply_markup: mainKeyboard() });
      return;
    }
    if (result !== "ok") {
      await patchUser(user.id, { state: "idle" });
      await ctx.reply("الان نمی‌شود وصل شد. بعداً دوباره امتحان کن.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }
    return;
  }

  if (user.state === "await_anon_msg" && user.pendingAnonTo) {
    const target = await prisma.user.findUnique({
      where: { anonCode: user.pendingAnonTo },
    });
    if (!target) {
      await patchUser(user.id, { state: "idle", pendingAnonTo: null });
      await ctx.reply("صاحب لینک پیدا نشد.", { reply_markup: mainKeyboard() });
      return;
    }
    await prisma.anonMessage.create({
      data: { toUserId: target.id, fromUserId: user.id, text },
    });
    await ctx.api.sendMessage(
      Number(target.telegramId),
      ["🕵️‍♂️ پیام ناشناس جدید:", "", text].join("\n"),
    );
    await patchUser(user.id, { state: "idle", pendingAnonTo: null });
    await ctx.reply("پیام ناشناس ارسال شد ✅", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  if (user.state === "chatting" && user.chatPartnerId) {
    const partner = await prisma.user.findUnique({
      where: { id: user.chatPartnerId },
    });
    if (!partner || partner.state !== "chatting") {
      await patchUser(user.id, { state: "idle", chatPartnerId: null });
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

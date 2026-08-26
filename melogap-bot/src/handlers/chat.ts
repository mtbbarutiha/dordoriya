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
    if (
      !partner ||
      partner.state !== "chatting" ||
      partner.chatPartnerId !== user.id
    ) {
      await patchUser(user.id, { state: "idle", chatPartnerId: null });
      if (partner?.chatPartnerId === user.id) {
        await patchUser(partner.id, { state: "idle", chatPartnerId: null });
      }
      await ctx.reply("چت قطع شده. از منو دوباره وصل شو.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }
    if (partner.telegramId >= 9000000000n) {
      await patchUser(user.id, { state: "idle", chatPartnerId: null });
      await patchUser(partner.id, { state: "idle", chatPartnerId: null });
      await ctx.reply("این مخاطب نمونه است — چت واقعی نیست.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }
    try {
      await ctx.api.sendMessage(
        Number(partner.telegramId),
        `👤 ناشناس:\n${text}`,
      );
    } catch (err) {
      console.error("chat relay failed", user.id, "->", partner.id, err);
      await patchUser(user.id, { state: "idle", chatPartnerId: null });
      await patchUser(partner.id, { state: "idle", chatPartnerId: null });
      await ctx.reply("ارسال نشد — چت قطع شد.", {
        reply_markup: mainKeyboard(),
      });
    }
    return;
  }

  return next();
});

/** رسانه در چت — فقط متن رله می‌شود */
chatHandler.on(
  ["message:photo", "message:video", "message:voice", "message:sticker", "message:document", "message:video_note"],
  async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();
    const user = await findByTelegram(from.id);
    if (!user || user.state !== "chatting") return next();
    await ctx.reply("در چت ناشناس فعلاً فقط متن پشتیبانی می‌شود.\nقطع: /end");
  },
);

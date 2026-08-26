import { Composer } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import { BTN, mainKeyboard } from "../keyboards/main.js";
import { logChatMessage } from "../services/chatLog.js";
import { setSecureChat } from "../services/match.js";

export const chatHandler = new Composer();

const MENU = new Set<string>(Object.values(BTN));

async function getChattingPair(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.state !== "chatting" || !user.chatPartnerId) return null;
  const partner = await prisma.user.findUnique({
    where: { id: user.chatPartnerId },
  });
  if (
    !partner ||
    partner.state !== "chatting" ||
    partner.chatPartnerId !== user.id
  ) {
    return { user, partner: null as null };
  }
  return { user, partner };
}

chatHandler.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();

  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user) return next();

  // دکمه‌های چت امن / قطع — قبل از MENU عمومی
  if (text === BTN.SECURE_CHAT_ON || text === BTN.SECURE_CHAT_OFF) {
    if (user.state !== "chatting") {
      await ctx.reply("الان در چت نیستی.", { reply_markup: mainKeyboard() });
      return;
    }
    const ok = await setSecureChat(
      ctx.api,
      user.id,
      text === BTN.SECURE_CHAT_ON,
    );
    if (!ok) {
      await ctx.reply("چت قطع شده.", { reply_markup: mainKeyboard() });
    }
    return;
  }

  if (MENU.has(text)) return next();

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
    const { sendChatRequest } = await import("../services/match.js");
    const result = await sendChatRequest(ctx.api, user.id, target.id);
    if (result === "demo") {
      await patchUser(user.id, { state: "idle" });
      await ctx.reply("این پروفایل نمونه است.", { reply_markup: mainKeyboard() });
      return;
    }
    if (result === "pending") {
      await patchUser(user.id, { state: "idle" });
      await ctx.reply("درخواست قبلی هنوز باز است.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }
    if (result !== "ok") {
      await patchUser(user.id, { state: "idle" });
      await ctx.reply("الان نمی‌شود درخواست فرستاد. بعداً دوباره امتحان کن.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }
    await patchUser(user.id, { state: "idle" });
    await ctx.reply("💬 درخواست چت ارسال شد. منتظر پاسخ باش.", {
      reply_markup: mainKeyboard(),
    });
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
    const pair = await getChattingPair(user.id);
    if (!pair?.partner) {
      await patchUser(user.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      await ctx.reply("چت قطع شده. از منو دوباره وصل شو.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }
    const partner = pair.partner;
    if (partner.telegramId >= 9000000000n) {
      await patchUser(user.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      await patchUser(partner.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      await ctx.reply("این مخاطب نمونه است — چت واقعی نیست.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }
    const secure = user.secureChat || partner.secureChat;
    try {
      const sent = await ctx.api.sendMessage(
        Number(partner.telegramId),
        `👤 ناشناس:\n${text}`,
        { protect_content: secure },
      );
      await logChatMessage(
        partner.id,
        user.id,
        partner.telegramId,
        sent.message_id,
      );
      // پیام خود کاربر هم برای wipe (اختیاری)
      await logChatMessage(
        user.id,
        partner.id,
        user.telegramId,
        ctx.message.message_id,
      );
    } catch (err) {
      console.error("chat relay failed", user.id, "->", partner.id, err);
      await patchUser(user.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      await patchUser(partner.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      await ctx.reply("ارسال نشد — چت قطع شد.", {
        reply_markup: mainKeyboard(),
      });
    }
    return;
  }

  return next();
});

/** رله عکس در چت (+ چت امن = protect_content) */
chatHandler.on("message:photo", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user || user.state !== "chatting") return next();

  const pair = await getChattingPair(user.id);
  if (!pair?.partner) {
    await patchUser(user.id, {
      state: "idle",
      chatPartnerId: null,
      secureChat: false,
    });
    await ctx.reply("چت قطع شده.", { reply_markup: mainKeyboard() });
    return;
  }
  const partner = pair.partner;
  if (partner.telegramId >= 9000000000n) {
    await ctx.reply("مخاطب نمونه است.");
    return;
  }

  const photos = ctx.message.photo;
  const best = photos[photos.length - 1]!;
  const secure = user.secureChat || partner.secureChat;
  const caption = ctx.message.caption
    ? `👤 ناشناس:\n${ctx.message.caption}`
    : "👤 ناشناس یک عکس فرستاد";

  try {
    const sent = await ctx.api.sendPhoto(
      Number(partner.telegramId),
      best.file_id,
      {
        caption,
        protect_content: secure,
      },
    );
    await logChatMessage(
      partner.id,
      user.id,
      partner.telegramId,
      sent.message_id,
    );
    await logChatMessage(
      user.id,
      partner.id,
      user.telegramId,
      ctx.message.message_id,
    );
    if (secure) {
      await ctx.reply("🔒 عکس با چت امن ارسال شد (غیرقابل ذخیره).");
    }
  } catch (err) {
    console.error("photo relay failed", err);
    await ctx.reply("ارسال عکس نشد.");
  }
});

chatHandler.on(
  [
    "message:video",
    "message:voice",
    "message:sticker",
    "message:document",
    "message:video_note",
  ],
  async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();
    const user = await findByTelegram(from.id);
    if (!user || user.state !== "chatting") return next();
    await ctx.reply(
      "در چت ناشناس فعلاً متن و عکس پشتیبانی می‌شود.\nقطع: /end",
    );
  },
);

// end of chat media handlers

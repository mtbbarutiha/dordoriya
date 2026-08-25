import { Composer } from "grammy";
import { ensureUser, findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import { mainKeyboard } from "../keyboards/main.js";
import {
  beginRegistration,
  finishRegistration,
} from "../services/register.js";
import { leaveQueueOrChat } from "../services/match.js";
import {
  lookingForKeyboard,
  registerGenderKeyboard,
  agePickerKeyboard,
} from "../keyboards/main.js";

export const startHandler = new Composer();

startHandler.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const payload = ctx.match?.trim() || "";

  // پیام ناشناس از لینک
  if (payload.startsWith("anon_")) {
    const anonCode = payload.slice(5);
    const me = await ensureUser({
      telegramId: from.id,
      ...(from.username ? { username: from.username } : {}),
      ...(from.first_name ? { firstName: from.first_name } : {}),
    });
    const target = await prisma.user.findUnique({ where: { anonCode } });
    if (!target || target.id === me.id) {
      await ctx.reply("این لینک پیام ناشناس معتبر نیست.");
      return;
    }
    if (!me.registered) {
      await ctx.reply("برای ارسال پیام ناشناس اول ثبت‌نام کن.");
      await beginRegistration(ctx, me.id);
      return;
    }
    await patchUser(me.id, {
      state: "await_anon_msg",
      pendingAnonTo: anonCode,
    });
    await ctx.reply(
      [
        "🕵️‍♂️ پیام ناشناس",
        "",
        "متن پیام را بنویس و بفرست.",
        "اسمت نشان داده نمی‌شود.",
        "انصراف: /cancel",
      ].join("\n"),
    );
    return;
  }

  const referralCodeFromStart = payload.startsWith("ref_")
    ? payload.slice(4)
    : undefined;

  const user = await ensureUser({
    telegramId: from.id,
    ...(from.username ? { username: from.username } : {}),
    ...(from.first_name ? { firstName: from.first_name } : {}),
    ...(referralCodeFromStart ? { referralCodeFromStart } : {}),
  });

  if (!user.registered) {
    await beginRegistration(ctx, user.id);
    return;
  }

  await patchUser(user.id, { state: "idle", pendingAnonTo: null });
  await ctx.reply(
    [
      "منوی اصلی:",
      "",
      "دوردوریا 💞 — چت | دوستیابی",
      "از دکمه‌های پایین یکی را انتخاب کن.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

startHandler.command("cancel", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const user = await findByTelegram(from.id);
  if (!user) return;
  if (!user.registered) {
    await beginRegistration(ctx, user.id);
    return;
  }
  await patchUser(user.id, { state: "idle", pendingAnonTo: null });
  await ctx.reply("لغو شد.", { reply_markup: mainKeyboard() });
});

startHandler.command("end", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const user = await findByTelegram(from.id);
  if (!user) return;
  if (user.state !== "chatting") {
    await ctx.reply("الان در چت نیستی.", { reply_markup: mainKeyboard() });
    return;
  }
  await leaveQueueOrChat(ctx.api, user, true);
  await ctx.reply("چت قطع شد.", { reply_markup: mainKeyboard() });
});

/** ادامه ثبت‌نام با کالبک و متن */
export const registerHandler = new Composer();

registerHandler.callbackQuery(/^reg:gender:(female|male)$/, async (ctx) => {
  const gender = ctx.match[1]!;
  const user = await findByTelegram(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  await patchUser(user.id, { gender, state: "age" });
  await ctx.answerCallbackQuery({ text: "ثبت شد" });
  await ctx.reply("عالی ✅\n\nسنت را از دکمه‌ها انتخاب کن:", {
    reply_markup: agePickerKeyboard(0, "reg"),
  });
});

registerHandler.callbackQuery(/^reg:agepage:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  const user = await findByTelegram(ctx.from.id);
  if (!user || user.state !== "age") {
    await ctx.answerCallbackQuery({ text: "منقضی شده" });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({
    reply_markup: agePickerKeyboard(page, "reg"),
  });
});

registerHandler.callbackQuery(/^reg:agenoop$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "صفحه سن" });
});

registerHandler.callbackQuery(/^reg:age:(\d+)$/, async (ctx) => {
  const age = Number(ctx.match[1]);
  const user = await findByTelegram(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  if (age < 18 || age > 60) {
    await ctx.answerCallbackQuery({ text: "سن نامعتبر" });
    return;
  }
  await patchUser(user.id, { age, state: "name" });
  await ctx.answerCallbackQuery({ text: `سن ${age} ثبت شد` });
  await ctx.reply(
    [
      `سن ${age} ثبت شد ✅`,
      "",
      "حالا یک نام نمایشی بنویس (مثلاً سارا یا آرمین):",
    ].join("\n"),
  );
});

registerHandler.callbackQuery(/^reg:looking:(female|male|any)$/, async (ctx, next) => {
  const lookingFor = ctx.match[1]!;
  const user = await findByTelegram(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  if (user.registered) return next();
  await patchUser(user.id, { lookingFor, state: "done" });
  await ctx.answerCallbackQuery({ text: "ثبت شد" });
  await finishRegistration(ctx, user.id);
});

registerHandler.on("message:text", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();

  const user = await findByTelegram(from.id);
  if (!user || user.registered) return next();

  if (user.state === "age") {
    await ctx.reply("سنت را از دکمه‌ها انتخاب کن 👇", {
      reply_markup: agePickerKeyboard(0, "reg"),
    });
    return;
  }

  if (user.state === "name") {
    if (text.length < 2 || text.length > 24) {
      await ctx.reply("نام باید بین ۲ تا ۲۴ حرف باشد.");
      return;
    }
    await patchUser(user.id, { displayName: text, state: "looking" });
    await ctx.reply("به دنبال چه کسی هستی؟", {
      reply_markup: lookingForKeyboard(),
    });
    return;
  }

  if (user.state === "gender") {
    await ctx.reply("لطفاً جنسیت را از دکمه‌ها انتخاب کن:", {
      reply_markup: registerGenderKeyboard(),
    });
    return;
  }

  if (user.state === "looking") {
    await ctx.reply("لطفاً از دکمه‌ها انتخاب کن:", {
      reply_markup: lookingForKeyboard(),
    });
    return;
  }

  return next();
});

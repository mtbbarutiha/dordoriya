import { Composer } from "grammy";
import { ensureUser, findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import { mainKeyboard } from "../keyboards/main.js";
import {
  beginRegistration,
  finishRegistration,
  resumeRegistration,
} from "../services/register.js";
import { leaveQueueOrChat } from "../services/match.js";
import {
  lookingForKeyboard,
  registerGenderKeyboard,
  agePickerKeyboard,
  languageKeyboard,
  countryKeyboard,
  provinceKeyboard,
  cityKeyboard,
} from "../keyboards/main.js";
import { provincesForCountry, citiesFor } from "../data/locations.js";

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
    await resumeRegistration(ctx, user);
    return;
  }

  await patchUser(user.id, { state: "idle", pendingAnonTo: null });
  await ctx.reply(
    [
      "📋 منوی اصلی دوردوریا",
      "",
      "دوردوریا 💞 — چت | دوست‌یابی",
      "از دکمه‌های پایین یا دکمه Menu کنار کادر پیام استفاده کن.",
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

registerHandler.callbackQuery("reg:noop", async (ctx) => {
  await ctx.answerCallbackQuery();
});

registerHandler.callbackQuery(/^reg:lang:(fa|en)$/, async (ctx) => {
  const language = ctx.match[1]!;
  const user = await findByTelegram(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  await patchUser(user.id, { language, state: "country" });
  await ctx.answerCallbackQuery({ text: "ثبت شد" });
  await ctx.reply("۲/۸ — کشور را انتخاب کن:", {
    reply_markup: countryKeyboard(),
  });
});

registerHandler.callbackQuery(/^reg:country:(IR|AF|TR|OTHER)$/, async (ctx) => {
  const country = ctx.match[1]!;
  const user = await findByTelegram(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  await patchUser(user.id, {
    country,
    province: null,
    city: null,
    state: "province",
  });
  await ctx.answerCallbackQuery({ text: "ثبت شد" });
  await ctx.reply("۳/۸ — استان را انتخاب کن:", {
    reply_markup: provinceKeyboard(country, 0),
  });
});

registerHandler.callbackQuery(/^reg:provpage:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  const user = await findByTelegram(ctx.from.id);
  if (!user || user.state !== "province" || !user.country) {
    await ctx.answerCallbackQuery({ text: "منقضی شده" });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({
    reply_markup: provinceKeyboard(user.country, page),
  });
});

registerHandler.callbackQuery(/^reg:prov:(\d+)$/, async (ctx) => {
  const idx = Number(ctx.match[1]);
  const user = await findByTelegram(ctx.from.id);
  if (!user || !user.country) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  const list = provincesForCountry(user.country);
  const province = list[idx];
  if (!province) {
    await ctx.answerCallbackQuery({ text: "نامعتبر" });
    return;
  }
  await patchUser(user.id, { province, city: null, state: "city" });
  await ctx.answerCallbackQuery({ text: province });
  await ctx.reply(`۴/۸ — شهر را در «${province}» انتخاب کن:`, {
    reply_markup: cityKeyboard(user.country, province, 0),
  });
});

registerHandler.callbackQuery(/^reg:citypage:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  const user = await findByTelegram(ctx.from.id);
  if (!user || user.state !== "city" || !user.country || !user.province) {
    await ctx.answerCallbackQuery({ text: "منقضی شده" });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({
    reply_markup: cityKeyboard(user.country, user.province, page),
  });
});

registerHandler.callbackQuery(/^reg:city:(\d+)$/, async (ctx) => {
  const idx = Number(ctx.match[1]);
  const user = await findByTelegram(ctx.from.id);
  if (!user || !user.country || !user.province) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  const list = citiesFor(user.country, user.province);
  const city = list[idx];
  if (!city) {
    await ctx.answerCallbackQuery({ text: "نامعتبر" });
    return;
  }
  await patchUser(user.id, { city, state: "gender" });
  await ctx.answerCallbackQuery({ text: city });
  await ctx.reply("۵/۸ — جنسیت را انتخاب کن:", {
    reply_markup: registerGenderKeyboard(),
  });
});

registerHandler.callbackQuery(/^reg:gender:(female|male)$/, async (ctx) => {
  const gender = ctx.match[1]!;
  const user = await findByTelegram(ctx.from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "اول /start بزن" });
    return;
  }
  await patchUser(user.id, { gender, state: "age" });
  await ctx.answerCallbackQuery({ text: "ثبت شد" });
  await ctx.reply("۶/۸ — سنت را از دکمه‌ها انتخاب کن:", {
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
      "۷/۸ — یک نام نمایشی بنویس (مثلاً سارا یا آرمین):",
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

  if (user.state === "name") {
    if (text.length < 2 || text.length > 24) {
      await ctx.reply("نام باید بین ۲ تا ۲۴ حرف باشد.");
      return;
    }
    await patchUser(user.id, { displayName: text, state: "looking" });
    await ctx.reply("۸/۸ — به دنبال چه کسی هستی؟", {
      reply_markup: lookingForKeyboard(),
    });
    return;
  }

  const { resumeRegistration } = await import("../services/register.js");
  await resumeRegistration(ctx, user);
});

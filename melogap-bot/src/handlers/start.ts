import { Composer } from "grammy";
import { ensureUser, findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import {
  mainKeyboard,
  REG,
  lookingReplyKeyboard,
  genderReplyKeyboard,
  ageReplyKeyboard,
  ageRangeReplyKeyboard,
  parseAgeRange,
  languageReplyKeyboard,
  countryReplyKeyboard,
  provinceReplyKeyboard,
  cityReplyKeyboard,
} from "../keyboards/main.js";
import {
  beginRegistration,
  finishRegistration,
  resumeRegistration,
} from "../services/register.js";
import { leaveQueueOrChat } from "../services/match.js";
import {
  COUNTRIES,
  provincesForCountry,
  citiesFor,
  provincesInRegion,
} from "../data/locations.js";

export const startHandler = new Composer();

startHandler.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const payload = ctx.match?.trim() || "";

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

export const registerHandler = new Composer();

/** علاقه برای کاربر ثبت‌شده (ویرایش) — inline دیگر نداریم، از متن */
registerHandler.on("message:text", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();

  const user = await findByTelegram(from.id);
  if (!user) return next();

  // --- ثبت‌نام ---
  if (!user.registered) {
    if (user.state === "language") {
      const language =
        text === REG.LANG_FA ? "fa" : text === REG.LANG_EN ? "en" : null;
      if (!language) {
        await ctx.reply("از دکمه‌های پایین زبان را انتخاب کن:", {
          reply_markup: languageReplyKeyboard(),
        });
        return;
      }
      await patchUser(user.id, { language, state: "country" });
      await ctx.reply("۲/۸ — کشور را انتخاب کن:", {
        reply_markup: countryReplyKeyboard(),
      });
      return;
    }

    if (user.state === "country") {
      const found = COUNTRIES.find((c) => c.label === text);
      if (!found) {
        await ctx.reply("از دکمه‌های پایین کشور را انتخاب کن:", {
          reply_markup: countryReplyKeyboard(),
        });
        return;
      }
      await patchUser(user.id, {
        country: found.id,
        province: null,
        city: null,
        state: "province",
      });
      await ctx.reply(
        found.id === "IR"
          ? "۳/۸ — منطقه را انتخاب کن:"
          : "۳/۸ — استان را انتخاب کن:",
        {
          reply_markup: provinceReplyKeyboard(found.id),
        },
      );
      return;
    }

    if (user.state === "province") {
      if (!user.country) {
        await resumeRegistration(ctx, user);
        return;
      }
      if (text === REG.REGION_BACK) {
        await ctx.reply("منطقه را انتخاب کن:", {
          reply_markup: provinceReplyKeyboard(user.country),
        });
        return;
      }
      if (user.country === "IR") {
        const regionProvinces = provincesInRegion(text);
        if (regionProvinces) {
          await ctx.reply(`استان در «${text}» را بزن:`, {
            reply_markup: provinceReplyKeyboard(user.country, text),
          });
          return;
        }
      }
      const list = provincesForCountry(user.country);
      if (!list.includes(text)) {
        await ctx.reply(
          user.country === "IR"
            ? "اول منطقه، بعد استان را از دکمه‌ها بزن:"
            : "از دکمه‌های پایین استان را انتخاب کن:",
          {
            reply_markup: provinceReplyKeyboard(user.country),
          },
        );
        return;
      }
      await patchUser(user.id, { province: text, city: null, state: "city" });
      await ctx.reply(`۴/۸ — شهر را در «${text}» انتخاب کن:`, {
        reply_markup: cityReplyKeyboard(user.country, text),
      });
      return;
    }

    if (user.state === "city") {
      if (!user.country || !user.province) {
        await resumeRegistration(ctx, user);
        return;
      }
      const list = citiesFor(user.country, user.province);
      if (!list.includes(text)) {
        await ctx.reply("از دکمه‌های پایین شهر را انتخاب کن:", {
          reply_markup: cityReplyKeyboard(user.country, user.province),
        });
        return;
      }
      await patchUser(user.id, { city: text, state: "gender" });
      await ctx.reply("۵/۸ — جنسیت را انتخاب کن:", {
        reply_markup: genderReplyKeyboard(),
      });
      return;
    }

    if (user.state === "gender") {
      const gender =
        text === REG.GENDER_F ? "female" : text === REG.GENDER_M ? "male" : null;
      if (!gender) {
        await ctx.reply("از دکمه‌های پایین جنسیت را انتخاب کن:", {
          reply_markup: genderReplyKeyboard(),
        });
        return;
      }
      await patchUser(user.id, { gender, state: "age" });
      await ctx.reply("۶/۸ — بازه سنت را بزن (دکمه‌های بزرگ پایین):", {
        reply_markup: ageRangeReplyKeyboard(),
      });
      return;
    }

    if (user.state === "age") {
      if (text === REG.AGE_BACK) {
        await ctx.reply("بازه سن را انتخاب کن:", {
          reply_markup: ageRangeReplyKeyboard(),
        });
        return;
      }
      const range = parseAgeRange(text);
      if (range) {
        await ctx.reply(`سنت چند سال است؟ (${range.label})`, {
          reply_markup: ageReplyKeyboard(range.from, range.to),
        });
        return;
      }
      const age = Number(text);
      if (!Number.isFinite(age) || age < 18 || age > 60) {
        await ctx.reply("اول بازه، بعد سن دقیق را از دکمه‌ها بزن:", {
          reply_markup: ageRangeReplyKeyboard(),
        });
        return;
      }
      await patchUser(user.id, { age, state: "name" });
      await ctx.reply(
        [
          `سن ${age} ثبت شد ✅`,
          "",
          "۷/۸ — یک نام نمایشی بنویس (مثلاً سارا یا آرمین):",
        ].join("\n"),
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    if (user.state === "name") {
      if (text.length < 2 || text.length > 24) {
        await ctx.reply("نام باید بین ۲ تا ۲۴ حرف باشد.");
        return;
      }
      await patchUser(user.id, { displayName: text, state: "looking" });
      await ctx.reply("۸/۸ — به دنبال چه کسی هستی؟", {
        reply_markup: lookingReplyKeyboard(),
      });
      return;
    }

    if (user.state === "looking") {
      const lookingFor =
        text === REG.LOOK_F
          ? "female"
          : text === REG.LOOK_M
            ? "male"
            : text === REG.LOOK_ANY
              ? "any"
              : null;
      if (!lookingFor) {
        await ctx.reply("از دکمه‌های پایین انتخاب کن:", {
          reply_markup: lookingReplyKeyboard(),
        });
        return;
      }
      await patchUser(user.id, { lookingFor, state: "done" });
      await finishRegistration(ctx, user.id);
      return;
    }

    await resumeRegistration(ctx, user);
    return;
  }

  // --- ویرایش سن بعد از ثبت‌نام ---
  if (user.state === "edit_age") {
    if (text === REG.AGE_BACK) {
      await ctx.reply("بازه سن را انتخاب کن:", {
        reply_markup: ageRangeReplyKeyboard(),
      });
      return;
    }
    const range = parseAgeRange(text);
    if (range) {
      await ctx.reply(`سن دقیق (${range.label}):`, {
        reply_markup: ageReplyKeyboard(range.from, range.to),
      });
      return;
    }
    const age = Number(text);
    if (!Number.isFinite(age) || age < 18 || age > 60) {
      await ctx.reply("اول بازه، بعد سن را از دکمه‌ها بزن:", {
        reply_markup: ageRangeReplyKeyboard(),
      });
      return;
    }
    await patchUser(user.id, { age, state: "idle" });
    await ctx.reply(`سن روی ${age} به‌روز شد ✅`, {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  if (user.state === "edit_looking") {
    const lookingFor =
      text === REG.LOOK_F
        ? "female"
        : text === REG.LOOK_M
          ? "male"
          : text === REG.LOOK_ANY
            ? "any"
            : null;
    if (!lookingFor) {
      await ctx.reply("از دکمه‌ها انتخاب کن:", {
        reply_markup: lookingReplyKeyboard(),
      });
      return;
    }
    await patchUser(user.id, { lookingFor, state: "idle" });
    await ctx.reply("علاقه به‌روز شد.", { reply_markup: mainKeyboard() });
    return;
  }

  return next();
});

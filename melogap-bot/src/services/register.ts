import type { Context } from "grammy";
import { ensureUser, findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import {
  mainKeyboard,
  languageReplyKeyboard,
  countryReplyKeyboard,
  provinceReplyKeyboard,
  cityReplyKeyboard,
  genderReplyKeyboard,
  ageRangeReplyKeyboard,
  lookingReplyKeyboard,
  regLocationKeyboard,
  regNameKeyboard,
} from "../keyboards/main.js";
import { WELCOME_DIAMONDS } from "../data/packages.js";
import { iranRegionPrompt } from "../data/locations.js";

const PREV_STEP: Record<string, string> = {
  country: "language",
  province: "country",
  city: "province",
  gender: "city",
  age: "gender",
  name: "age",
  looking: "name",
  location: "looking",
};

export async function beginRegistration(ctx: Context, userId: number) {
  await patchUser(userId, { state: "language", registered: false });
  await ctx.reply(
    [
      "به دوردوریا خوش آمدی 💞",
      "",
      "برای شروع، ثبت‌نام را کامل کن.",
      "در هر مرحله می‌توانی «↩️ بازگشت به قبل» را بزنی.",
      "",
      "۱/۹ — زبان خودت را انتخاب کن:",
    ].join("\n"),
    { reply_markup: languageReplyKeyboard() },
  );
}

/** نمایش UI مرحله فعلی ثبت‌نام */
export async function resumeRegistration(
  ctx: Context,
  user: {
    id: number;
    state: string;
    country: string | null;
    province: string | null;
  },
) {
  switch (user.state) {
    case "language":
      await ctx.reply("۱/۹ — زبان را انتخاب کن:", {
        reply_markup: languageReplyKeyboard(),
      });
      break;
    case "country":
      await ctx.reply("۲/۹ — کشور را انتخاب کن:", {
        reply_markup: countryReplyKeyboard(true),
      });
      break;
    case "province":
      await ctx.reply(
        (user.country ?? "IR") === "IR"
          ? iranRegionPrompt()
          : "۳/۹ — استان را انتخاب کن:",
        {
          reply_markup: provinceReplyKeyboard(user.country ?? "IR", undefined, true),
        },
      );
      break;
    case "city":
      if (!user.country || !user.province) {
        await beginRegistration(ctx, user.id);
        break;
      }
      await ctx.reply("۴/۹ — شهر را انتخاب کن:", {
        reply_markup: cityReplyKeyboard(user.country, user.province, true),
      });
      break;
    case "gender":
      await ctx.reply("۵/۹ — جنسیت را انتخاب کن:", {
        reply_markup: genderReplyKeyboard(true),
      });
      break;
    case "age":
      await ctx.reply("۶/۹ — بازه سن را انتخاب کن:", {
        reply_markup: ageRangeReplyKeyboard(true),
      });
      break;
    case "name":
      await ctx.reply("۷/۹ — یک نام نمایشی بفرست:", {
        reply_markup: regNameKeyboard(),
      });
      break;
    case "looking":
      await ctx.reply("۸/۹ — به دنبال چه کسی هستی؟", {
        reply_markup: lookingReplyKeyboard(true),
      });
      break;
    case "location":
      await ctx.reply(
        [
          "۹/۹ — موقعیتت را بفرست 📍",
          "",
          "برای نمایش افراد اطراف، به موقعیتت نیاز داریم.",
          "مختصات دقیق به کسی نشان داده نمی‌شود.",
        ].join("\n"),
        { reply_markup: regLocationKeyboard() },
      );
      break;
    default:
      await beginRegistration(ctx, user.id);
  }
}

/** بازگشت یک مرحله در ثبت‌نام */
export async function goBackRegistration(
  ctx: Context,
  user: {
    id: number;
    state: string;
    country: string | null;
    province: string | null;
  },
) {
  if (user.state === "language" || textIsFirst(user.state)) {
    await ctx.reply("این اولین مرحله است — زبان را انتخاب کن:", {
      reply_markup: languageReplyKeyboard(),
    });
    return;
  }
  const prev = PREV_STEP[user.state];
  if (!prev) {
    await resumeRegistration(ctx, user);
    return;
  }

  const data: Record<string, unknown> = { state: prev };
  // پاک‌سازی فیلدهای مراحل جلوتر تا اشتباه نماند
  if (prev === "language") {
    data.language = null;
    data.country = null;
    data.province = null;
    data.city = null;
  } else if (prev === "country") {
    data.country = null;
    data.province = null;
    data.city = null;
  } else if (prev === "province") {
    data.province = null;
    data.city = null;
  } else if (prev === "city") {
    data.city = null;
  } else if (prev === "gender") {
    data.gender = null;
  } else if (prev === "age") {
    data.age = null;
  } else if (prev === "name") {
    data.displayName = null;
  } else if (prev === "looking") {
    data.lookingFor = null;
  }

  await patchUser(user.id, data);
  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh) return;
  await ctx.reply("↩️ برگشتی به مرحله قبل — دوباره انتخاب کن:", {
    reply_markup: { remove_keyboard: true },
  });
  await resumeRegistration(ctx, fresh);
}

function textIsFirst(state: string) {
  return !PREV_STEP[state];
}

export async function requireRegistered(ctx: Context) {
  const from = ctx.from;
  if (!from) return null;
  let user = await findByTelegram(from.id);
  if (!user) {
    user = await ensureUser({
      telegramId: from.id,
      ...(from.username ? { username: from.username } : {}),
      ...(from.first_name ? { firstName: from.first_name } : {}),
    });
  }
  if (!user.registered) {
    await ctx.reply("اول باید ثبت‌نام را کامل کنی.\nاز همین‌جا ادامه بده:");
    await resumeRegistration(ctx, user);
    return null;
  }

  if (user.deletedAt) {
    await ctx.reply("این حساب حذف شده. برای ساخت حساب جدید /start بزن.");
    return null;
  }

  return user;
}

export async function finishRegistration(ctx: Context, userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  await patchUser(userId, { state: "idle", registered: true });

  const { welcomeSloganMessage, fullGuideMessage } = await import(
    "../data/guide.js"
  );

  await ctx.reply(
    welcomeSloganMessage({
      displayName: user?.displayName,
      city: user?.city,
      province: user?.province,
      diamonds: WELCOME_DIAMONDS,
    }),
    { reply_markup: mainKeyboard() },
  );

  await ctx.reply(fullGuideMessage(), {
    reply_markup: mainKeyboard(),
  });
}

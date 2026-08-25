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
} from "../keyboards/main.js";
import { WELCOME_DIAMONDS } from "../data/packages.js";

export async function beginRegistration(ctx: Context, userId: number) {
  await patchUser(userId, { state: "language", registered: false });
  await ctx.reply(
    [
      "به دوردوریا خوش آمدی 💞",
      "",
      "برای شروع، ثبت‌نام را کامل کن.",
      "۱/۹ — زبان خودت را انتخاب کن:",
    ].join("\n"),
    { reply_markup: languageReplyKeyboard() },
  );
}

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
        reply_markup: countryReplyKeyboard(),
      });
      break;
    case "province":
      await ctx.reply(
        (user.country ?? "IR") === "IR"
          ? "۳/۹ — منطقه را انتخاب کن:"
          : "۳/۹ — استان را انتخاب کن:",
        {
          reply_markup: provinceReplyKeyboard(user.country ?? "IR"),
        },
      );
      break;
    case "city":
      if (!user.country || !user.province) {
        await beginRegistration(ctx, user.id);
        break;
      }
      await ctx.reply("۴/۹ — شهر را انتخاب کن:", {
        reply_markup: cityReplyKeyboard(user.country, user.province),
      });
      break;
    case "gender":
      await ctx.reply("۵/۹ — جنسیت را انتخاب کن:", {
        reply_markup: genderReplyKeyboard(),
      });
      break;
    case "age":
      await ctx.reply("۶/۹ — بازه سن را انتخاب کن:", {
        reply_markup: ageRangeReplyKeyboard(),
      });
      break;
    case "name":
      await ctx.reply("۷/۹ — یک نام نمایشی بفرست:", {
        reply_markup: { remove_keyboard: true },
      });
      break;
    case "looking":
      await ctx.reply("۸/۹ — به دنبال چه کسی هستی؟", {
        reply_markup: lookingReplyKeyboard(),
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
  const loc = [user?.province, user?.city].filter(Boolean).join("، ");
  const hasGps = user?.latitude != null && user?.longitude != null;
  await ctx.reply(
    [
      "✅ ثبت‌نام تمام شد!",
      loc ? `🏘 ${loc}` : null,
      hasGps ? "📍 موقعیت برای نزدیک‌ها ذخیره شد" : null,
      "",
      `هدیه ورود: ${WELCOME_DIAMONDS} سکه 🪙`,
      "",
      "منوی اصلی:",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: mainKeyboard() },
  );
}

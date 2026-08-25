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
  ageReplyKeyboard,
  lookingReplyKeyboard,
} from "../keyboards/main.js";
import { WELCOME_DIAMONDS } from "../data/packages.js";

export async function beginRegistration(ctx: Context, userId: number) {
  await patchUser(userId, { state: "language", registered: false });
  await ctx.reply(
    [
      "به دوردوریا خوش آمدی 💞",
      "",
      "برای شروع، ثبت‌نام را کامل کن.",
      "۱/۸ — زبان خودت را انتخاب کن:",
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
      await ctx.reply("۱/۸ — زبان را انتخاب کن:", {
        reply_markup: languageReplyKeyboard(),
      });
      break;
    case "country":
      await ctx.reply("۲/۸ — کشور را انتخاب کن:", {
        reply_markup: countryReplyKeyboard(),
      });
      break;
    case "province":
      await ctx.reply("۳/۸ — استان را انتخاب کن:", {
        reply_markup: provinceReplyKeyboard(user.country ?? "IR"),
      });
      break;
    case "city":
      if (!user.country || !user.province) {
        await beginRegistration(ctx, user.id);
        break;
      }
      await ctx.reply("۴/۸ — شهر را انتخاب کن:", {
        reply_markup: cityReplyKeyboard(user.country, user.province),
      });
      break;
    case "gender":
      await ctx.reply("۵/۸ — جنسیت را انتخاب کن:", {
        reply_markup: genderReplyKeyboard(),
      });
      break;
    case "age":
      await ctx.reply("۶/۸ — سن را انتخاب کن (دکمه‌های بزرگ پایین):", {
        reply_markup: ageReplyKeyboard(),
      });
      break;
    case "name":
      await ctx.reply("۷/۸ — یک نام نمایشی بفرست:", {
        reply_markup: { remove_keyboard: true },
      });
      break;
    case "looking":
      await ctx.reply("۸/۸ — به دنبال چه کسی هستی؟", {
        reply_markup: lookingReplyKeyboard(),
      });
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
  await ctx.reply(
    [
      "✅ ثبت‌نام تمام شد!",
      loc ? `📍 ${loc}` : null,
      "",
      `هدیه ورود: ${WELCOME_DIAMONDS} الماس 💎`,
      "",
      "منوی اصلی:",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: mainKeyboard() },
  );
}

import type { Context } from "grammy";
import { ensureUser, findByTelegram, patchUser } from "../db/users.js";
import {
  mainKeyboard,
  registerGenderKeyboard,
  lookingForKeyboard,
  agePickerKeyboard,
} from "../keyboards/main.js";
import { WELCOME_DIAMONDS } from "../data/packages.js";

export async function beginRegistration(ctx: Context, userId: number) {
  await patchUser(userId, { state: "gender", registered: false });
  await ctx.reply(
    [
      "به دوردوریا خوش آمدی 💞",
      "",
      "برای شروع باید پروفایلت را بسازی.",
      "جنسیت خودت را انتخاب کن:",
    ].join("\n"),
    { reply_markup: registerGenderKeyboard() },
  );
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
    await ctx.reply(
      "اول باید ثبت‌نام را کامل کنی.\nاز دکمه‌های زیر ادامه بده یا /start بزن.",
    );
    if (user.state === "gender" || !user.gender) {
      await beginRegistration(ctx, user.id);
    } else if (user.state === "age") {
      await ctx.reply("سنت را از دکمه‌ها انتخاب کن:", {
        reply_markup: agePickerKeyboard(0, "reg"),
      });
    } else if (user.state === "name") {
      await ctx.reply("یک نام نمایشی برای پروفایلت بفرست:");
    } else if (user.state === "looking") {
      await ctx.reply("به دنبال چه کسی هستی؟", {
        reply_markup: lookingForKeyboard(),
      });
    } else {
      await beginRegistration(ctx, user.id);
    }
    return null;
  }
  return user;
}

export async function finishRegistration(ctx: Context, userId: number) {
  await patchUser(userId, { state: "idle", registered: true });
  await ctx.reply(
    [
      "✅ ثبت‌نام تمام شد!",
      "",
      `هدیه ورود: ${WELCOME_DIAMONDS} الماس 💎`,
      "",
      "منوی اصلی:",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
}

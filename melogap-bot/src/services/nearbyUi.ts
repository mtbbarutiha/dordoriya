import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { ensureUserCode } from "../db/users.js";
import { formatNum } from "../data/packages.js";
import { listThumbWithBadge } from "../lib/faceBadgePhoto.js";
import { mainKeyboard } from "../keyboards/main.js";
import { findNearby } from "./nearby.js";
import type { Api } from "grammy";

export function nearbyLocationChoiceKeyboard() {
  return new InlineKeyboard()
    .text("📍 لوکیشن ذخیره‌شده من", "nearby:saved")
    .row()
    .text("📡 لوکیشن فعلی (تازه)", "nearby:fresh");
}

/** نمایش لیست افراد نزدیک بر اساس مختصات ذخیره‌شده کاربر */
export async function showNearbyResults(ctx: Context, userId: number) {
  const nearby = await findNearby(userId);
  if (!nearby.length) {
    await ctx.reply("فعلاً کسی در اطراف پیدا نشد.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  await ctx.reply(
    [
      "کی را نشون بدم؟ انتخاب کن 👇",
      `📍 ${nearby.length} نفر نزدیک تو:`,
      "",
      "روی عکس یا /user_ بزن.",
    ].join("\n"),
  );

  for (const item of nearby) {
    const u = item.user;
    if (!u.userCode) await ensureUserCode(u.id, u.userCode);
    const code = u.userCode ?? (await ensureUserCode(u.id, null));
    const online =
      Date.now() - u.lastActiveAt.getTime() <= 15 * 60_000 ? "🟢 " : "";
    const badge = u.faceVerified ? "✅" : "🕶";
    const place = [u.city, u.province ? `(${u.province})` : null]
      .filter(Boolean)
      .join("");
    try {
      const thumb = await listThumbWithBadge(ctx.api, u);
      await ctx.replyWithPhoto(thumb, {
        caption: [
          `${online}${u.displayName ?? "ناشناس"} ${u.age ?? "—"} ${badge}`,
          `/user_${code}`,
          `${place || "—"} (🏁 ${item.distanceLabel}) (❤️ ${formatNum(u.likesCount)})`,
        ].join("\n"),
        reply_markup: new InlineKeyboard().text(
          "👤 مشاهده پروفایل",
          `open:${code}`,
        ),
      });
    } catch {
      await ctx.reply(
        `${online}${u.displayName ?? "ناشناس"} ${u.age ?? "—"}\n/user_${code}`,
      );
    }
  }
  await ctx.reply("⬆️ لیست نزدیک‌ها", { reply_markup: mainKeyboard() });
}

export async function notifyWipeDone(
  api: Api,
  telegramId: bigint | number,
  deletedCount: number,
) {
  if (telegramId >= 9000000000n) return;
  try {
    await api.sendMessage(
      Number(telegramId),
      [
        "🗑 گفتگو پاک شد.",
        `${deletedCount} پیام (متن/عکس/ویدیو) حذف شد.`,
        "",
        "اگر هنوز چیزی باقی مانده، در تلگرام روی این چت بزن → Clear history.",
      ].join("\n"),
      { reply_markup: mainKeyboard() },
    );
  } catch {
    /* ignore */
  }
}

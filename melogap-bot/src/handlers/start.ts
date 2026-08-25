import { Composer } from "grammy";
import { upsertUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import { mainKeyboard } from "../keyboards/main.js";
import { setState } from "../db/users.js";
import { REFERRAL_BONUS } from "../data/packages.js";

export const startHandler = new Composer();

startHandler.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const payload = ctx.match?.trim() || "";

  // لینک صندوق ناشناس: anon_XXXX
  if (payload.startsWith("anon_")) {
    const anonCode = payload.slice(5);
    const target = await prisma.user.findUnique({ where: { anonCode } });
    const me = await upsertUser({
      telegramId: from.id,
      ...(from.username ? { username: from.username } : {}),
      ...(from.first_name ? { firstName: from.first_name } : {}),
    });

    if (!target || target.id === me.id) {
      await ctx.reply("این صندوق ناشناس معتبر نیست.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }

    await setState(me.id, "await_anon_msg", { pendingAnonTo: anonCode });
    await ctx.reply(
      [
        "🎭 صندوق ناشناس",
        "",
        "پیامت رو بنویس و بفرست.",
        "اسمت به طرف مقابل نشون داده نمی‌شه.",
        "برای انصراف: /cancel",
      ].join("\n"),
    );
    return;
  }

  const referralCodeFromStart = payload.startsWith("ref_")
    ? payload.slice(4)
    : payload || undefined;

  const before = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  await upsertUser({
    telegramId: from.id,
    ...(from.username ? { username: from.username } : {}),
    ...(from.first_name ? { firstName: from.first_name } : {}),
    ...(referralCodeFromStart ? { referralCodeFromStart } : {}),
  });

  const isNew = !before;
  const lines = [
    "سلام به دودوریا 🌑",
    "یه ناشناس، یه حرف واقعی.",
    "",
    "اینجا اسمت مهم نیست؛ حرفت مهمه.",
    "یه دکمه بزن و وارد فضای ناشناس شو.",
  ];
  if (isNew) {
    lines.push("", "🎁 هدیه ورود: ۲۰ سکه");
    if (referralCodeFromStart) {
      lines.push(`(معرفی ثبت شد — معرف ${REFERRAL_BONUS} سکه گرفت)`);
    }
  }

  await ctx.reply(lines.join("\n"), { reply_markup: mainKeyboard() });
});

startHandler.command("cancel", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });
  if (!user) return;
  await setState(user.id, "idle", { pendingAnonTo: null });
  await ctx.reply("لغو شد.", { reply_markup: mainKeyboard() });
});

startHandler.command("end", async (ctx) => {
  const { leaveQueueOrChat } = await import("../services/match.js");
  const from = ctx.from;
  if (!from) return;
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });
  if (!user) return;
  if (user.state !== "chatting") {
    await ctx.reply("الان تو چت نیستی.", { reply_markup: mainKeyboard() });
    return;
  }
  await leaveQueueOrChat(ctx.api, user, true);
  await ctx.reply("چت قطع شد.", { reply_markup: mainKeyboard() });
});

import { Composer, InlineKeyboard, type Context } from "grammy";
import type { Message } from "grammy/types";
import { isAdmin } from "../lib/admin.js";
import { findByTelegram, patchUser } from "../db/users.js";
import { langOf, t, type Lang } from "../i18n/index.js";
import { languageReplyKeyboard } from "../keyboards/main.js";
import { logger } from "../lib/logger.js";
import { withTimeout } from "../lib/timeout.js";

const CACHE_TTL_MS = 30_000;
const NEGATIVE_CACHE_TTL_MS = 5_000;
const PROMPT_THROTTLE_MS = 15 * 60_000;
const MEMBER_CHECK_MS = 8_000;
const TELEGRAM_SERVICE_USER_ID = 777000;
const memberCache = new Map<number, { ok: boolean; at: number }>();
/** فوروارد تأییدشده به‌ازای هر کاربر (کلید = username بدون @) */
const forwardVerified = new Map<number, Set<string>>();
const lastPromptAt = new Map<number, number>();
let lastInaccessibleLog = 0;

export type MemberStatus = "member" | "not_member" | "unknown";

export type RequiredChannel = {
  username: string; // @name
  chatId: number | string;
  url: string;
  labelFa: string;
  labelEn: string;
};

function normalizeUsername(raw: string, fallback: string): string {
  const v = raw.trim();
  if (!v) return fallback.startsWith("@") ? fallback : `@${fallback}`;
  if (/^https?:\/\//i.test(v)) {
    const m = v.match(/t\.me\/([A-Za-z0-9_]+)/i);
    return m ? `@${m[1]}` : (fallback.startsWith("@") ? fallback : `@${fallback}`);
  }
  if (/^-?\d+$/.test(v)) return fallback.startsWith("@") ? fallback : `@${fallback}`;
  return v.startsWith("@") ? v : `@${v}`;
}

function channelLabel(username: string): { fa: string; en: string } {
  const u = username.replace(/^@/, "").toLowerCase();
  if (u === "petdating") return { fa: "پت‌دیت", en: "Petdate" };
  if (u === "dordoriabot") return { fa: "دوردوریا", en: "Dordoriya" };
  return { fa: username, en: username };
}

const DEFAULT_CHANNELS = ["@dordoriabot", "@petdating"] as const;
const DEFAULT_CHAT_IDS = ["-1004324389916", "-1004405288563"] as const;

/** لیست کانال‌های اجباری (هر دو باید عضو باشند) */
export function requiredChannels(): RequiredChannel[] {
  const rawNames = (process.env.FORCE_JOIN_CHANNEL ?? DEFAULT_CHANNELS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rawIds = (process.env.FORCE_JOIN_CHAT_ID ?? DEFAULT_CHAT_IDS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const names =
    rawNames.length > 0
      ? rawNames
      : [...DEFAULT_CHANNELS];

  return names.map((name, i) => {
    const username = normalizeUsername(name, DEFAULT_CHANNELS[i] ?? "@dordoriabot");
    const idRaw = rawIds[i] ?? "";
    const chatId =
      idRaw && /^-?\d+$/.test(idRaw) ? Number(idRaw) : username;
    const labels = channelLabel(username);
    return {
      username,
      chatId,
      url: `https://t.me/${username.replace(/^@/, "")}`,
      labelFa: labels.fa,
      labelEn: labels.en,
    };
  });
}

/** سازگاری عقب‌رو: اولین کانال */
export function channelUsername(): string {
  return requiredChannels()[0]?.username ?? "@dordoriabot";
}

/** سازگاری عقب‌رو: اولین کانال */
export function channelChatId(): number | string {
  return requiredChannels()[0]?.chatId ?? "@dordoriabot";
}

export function joinUrl(): string {
  return requiredChannels()[0]?.url ?? "https://t.me/dordoriabot";
}

export function joinKeyboard(lang: Lang) {
  const kb = new InlineKeyboard();
  const channels = requiredChannels();
  for (const ch of channels) {
    const label =
      lang === "en" ? `📣 Join ${ch.labelEn}` : `📣 عضویت ${ch.labelFa}`;
    kb.url(label, ch.url).row();
  }
  kb.text(lang === "en" ? "✅ I've joined both" : "✅ عضو هر دو شدم", "fj:check");
  return kb;
}

export type ForceJoinPromptMode = "register" | "continue";

export function forceJoinPrompt(
  lang: Lang,
  withForwardHint = false,
  mode: ForceJoinPromptMode = "register",
): string {
  const channels = requiredChannels();
  const links = channels.map((c) => c.url).join("\n");
  const lines =
    lang === "en"
      ? [
          mode === "continue"
            ? "📣 To keep using the bot, join BOTH channels:"
            : "📣 Before registration, join BOTH channels:",
          links,
          "",
          "1) Tap each join button",
          "2) Then tap «I've joined both»",
        ]
      : [
          mode === "continue"
            ? "📣 برای ادامه کار با ربات، عضو هر دو کانال شو:"
            : "📣 قبل از ثبت‌نام، عضو هر دو کانال شو:",
          links,
          "",
          "۱) دکمه عضویت هر کانال را بزن",
          "۲) بعد «عضو هر دو شدم» را بزن",
        ];

  if (withForwardHint) {
    lines.push(
      "",
      ...(lang === "en"
        ? [
            "If check fails: forward one post from each channel here.",
          ]
        : [
            "اگر تأیید نشد: از هر کانال یک پست را همین‌جا فوروارد کن.",
          ]),
    );
  }
  return lines.join("\n");
}

async function resolveLang(ctx: Context): Promise<Lang> {
  if (!ctx.from) return "fa";
  try {
    return langOf(await findByTelegram(ctx.from.id));
  } catch {
    return "fa";
  }
}

async function checkOneChannel(
  ctx: Context,
  userId: number,
  ch: RequiredChannel,
): Promise<MemberStatus> {
  const refs: Array<string | number> = [ch.chatId];
  if (refs[0] !== ch.username) refs.push(ch.username);

  let lastErr = "";
  for (const ref of refs) {
    try {
      const m = await withTimeout(
        ctx.api.getChatMember(ref, userId),
        MEMBER_CHECK_MS,
        `getChatMember:${ref}`,
      );
      const ok = ["creator", "administrator", "member", "restricted"].includes(
        m.status,
      );
      return ok ? "member" : "not_member";
    } catch (err) {
      lastErr =
        err && typeof err === "object" && "description" in err
          ? String((err as { description: unknown }).description)
          : err instanceof Error
            ? err.message
            : String(err);
      if (lastErr.startsWith("TIMEOUT:")) {
        logger.warn("forceJoin.member_timeout", { ref: String(ref), userId });
      }
    }
  }

  if (
    lastErr.includes("member list is inaccessible") ||
    lastErr.includes("CHAT_ADMIN_REQUIRED") ||
    lastErr.includes("not enough rights")
  ) {
    if (Date.now() - lastInaccessibleLog > 60_000) {
      lastInaccessibleLog = Date.now();
      logger.error("forceJoin.bot_not_admin", {
        channel: ch.username,
        err: lastErr,
      });
    }
    return "unknown";
  }

  logger.error("forceJoin.getChatMember_failed", {
    userId,
    channel: ch.username,
    err: lastErr,
  });
  return "unknown";
}

function channelKey(ch: RequiredChannel): string {
  return ch.username.replace(/^@/, "").toLowerCase();
}

function isForwardVerified(userId: number, ch: RequiredChannel): boolean {
  return forwardVerified.get(userId)?.has(channelKey(ch)) ?? false;
}

export async function checkChannelMembershipDetail(
  ctx: Context,
  userId: number,
): Promise<{
  status: MemberStatus;
  missing: RequiredChannel[];
  unknown: RequiredChannel[];
}> {
  const cached = memberCache.get(userId);
  if (cached?.ok && Date.now() - cached.at < CACHE_TTL_MS) {
    return { status: "member", missing: [], unknown: [] };
  }
  if (
    cached &&
    !cached.ok &&
    Date.now() - cached.at < NEGATIVE_CACHE_TTL_MS
  ) {
    // keep going to real check after a very short negative TTL
  }

  const missing: RequiredChannel[] = [];
  const unknown: RequiredChannel[] = [];

  for (const ch of requiredChannels()) {
    if (isForwardVerified(userId, ch)) continue;
    const st = await checkOneChannel(ctx, userId, ch);
    if (st === "member") continue;
    if (st === "not_member") missing.push(ch);
    else unknown.push(ch);
  }

  if (missing.length === 0 && unknown.length === 0) {
    memberCache.set(userId, { ok: true, at: Date.now() });
    return { status: "member", missing: [], unknown: [] };
  }
  if (missing.length > 0) {
    memberCache.set(userId, { ok: false, at: Date.now() });
    return { status: "not_member", missing, unknown };
  }
  return { status: "unknown", missing: [], unknown };
}

export async function checkChannelMember(
  ctx: Context,
  userId: number,
): Promise<MemberStatus> {
  const detail = await checkChannelMembershipDetail(ctx, userId);
  return detail.status;
}

/** آیا پیام فوروارد از یکی از کانال‌های اجباری است؟ */
export function matchForwardedRequiredChannel(
  msg: Message,
): RequiredChannel | null {
  const anyMsg = msg as Message & {
    forward_from_chat?: { id: number; type?: string; username?: string };
    forward_origin?: {
      type: string;
      chat?: { id: number; username?: string };
    };
  };

  const legacy = anyMsg.forward_from_chat;
  const origin =
    anyMsg.forward_origin?.type === "channel"
      ? anyMsg.forward_origin.chat
      : undefined;

  for (const ch of requiredChannels()) {
    const expectedNum =
      typeof ch.chatId === "number" ? ch.chatId : Number(ch.chatId);
    const expectedUser = channelKey(ch);

    if (legacy?.type === "channel") {
      if (Number.isFinite(expectedNum) && legacy.id === expectedNum) return ch;
      if (legacy.username?.toLowerCase() === expectedUser) return ch;
    }
    if (origin) {
      if (Number.isFinite(expectedNum) && origin.id === expectedNum) return ch;
      if (origin.username?.toLowerCase() === expectedUser) return ch;
    }
  }
  return null;
}

export function isForwardFromRequiredChannel(msg: Message): boolean {
  return matchForwardedRequiredChannel(msg) != null;
}

function looksLikeForward(msg: Message): boolean {
  const anyMsg = msg as Message & {
    forward_date?: number;
    forward_origin?: unknown;
    forward_from_chat?: unknown;
  };
  return Boolean(
    anyMsg.forward_date || anyMsg.forward_origin || anyMsg.forward_from_chat,
  );
}

export function clearForceJoinCache(userId?: number) {
  if (userId == null) {
    memberCache.clear();
    forwardVerified.clear();
    lastPromptAt.clear();
  } else {
    memberCache.delete(userId);
    forwardVerified.delete(userId);
    lastPromptAt.delete(userId);
  }
}

async function sendJoinPrompt(
  ctx: Context,
  userId: number,
  lang: Lang,
  mode: ForceJoinPromptMode,
  withForwardHint: boolean,
  force = false,
) {
  const now = Date.now();
  const prev = lastPromptAt.get(userId) ?? 0;
  if (!force && now - prev < PROMPT_THROTTLE_MS) return;
  lastPromptAt.set(userId, now);
  await ctx.reply(forceJoinPrompt(lang, withForwardHint, mode), {
    reply_markup: joinKeyboard(lang),
  });
}

async function resumeAfterJoin(
  ctx: Context,
  dbUser: { id: number; registered: boolean } | null,
  lang: Lang,
  from: { id: number; username?: string; first_name?: string },
) {
  if (dbUser && !dbUser.registered) {
    await continueRegistrationAfterJoin(ctx, dbUser.id, lang);
    return;
  }
  if (dbUser?.registered) {
    const { restoreUserSession } = await import("../services/sessionRestore.js");
    await restoreUserSession(ctx, dbUser as never, { announce: true });
    return;
  }
  const { ensureUser } = await import("../db/users.js");
  const created = await ensureUser({
    telegramId: from.id,
    ...(from.username ? { username: from.username } : {}),
    ...(from.first_name ? { firstName: from.first_name } : {}),
  });
  await continueRegistrationAfterJoin(ctx, created.id, lang);
}

function markForwardVerified(userId: number, ch: RequiredChannel) {
  let set = forwardVerified.get(userId);
  if (!set) {
    set = new Set();
    forwardVerified.set(userId, set);
  }
  set.add(channelKey(ch));
  memberCache.delete(userId);
}

/** بعد از تأیید عضویت → شروع انتخاب زبان */
export async function continueRegistrationAfterJoin(
  ctx: Context,
  userId: number,
  lang: Lang = "fa",
) {
  await patchUser(userId, { state: "language", registered: false });
  await ctx.reply(
    lang === "en"
      ? `${t("en", "reg_welcome")}`
      : `${t("fa", "reg_welcome")}`,
    { reply_markup: languageReplyKeyboard() },
  );
}

/**
 * گیت ثبت‌نام: اگر عضو هر دو کانال نیست، state=force_join و پرامپت بفرست.
 * @returns true اگر می‌تواند ثبت‌نام را ادامه دهد
 */
export async function gateRegistrationJoin(
  ctx: Context,
  user: { id: number; telegramId: bigint | number; language?: string | null },
): Promise<boolean> {
  const telegramId = Number(user.telegramId);
  if (isAdmin(telegramId)) return true;

  const detail = await checkChannelMembershipDetail(ctx, telegramId);
  if (detail.status === "member") return true;

  await patchUser(user.id, { state: "force_join", registered: false });
  const lang = langOf(user);
  await sendJoinPrompt(
    ctx,
    telegramId,
    lang,
    "register",
    detail.status === "unknown",
    true,
  );
  return false;
}

function missingAlert(lang: Lang, missing: RequiredChannel[]): string {
  if (missing.length === 0) {
    return lang === "en"
      ? "You're not a member of both channels yet."
      : "هنوز عضو هر دو کانال نشدی.";
  }
  const names =
    lang === "en"
      ? missing.map((c) => c.labelEn).join(", ")
      : missing.map((c) => c.labelFa).join("، ");
  return lang === "en"
    ? `Still missing: ${names}`
    : `هنوز عضو این‌ها نیستی: ${names}`;
}

export const forceJoinHandler = new Composer();

/**
 * گیت سراسری: کاربران قدیمی و جدید تا عضو هر دو کانال نباشند
 * نمی‌توانند از ربات استفاده کنند (ادمین مستثنی است).
 */
forceJoinHandler.use(async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  if (from.is_bot || from.id === TELEGRAM_SERVICE_USER_ID) return next();
  if (isAdmin(from.id)) return next();

  // فقط چت خصوصی — هرگز در گروه کامنت/کانال پیام عضویت نفرست
  if (ctx.chat && ctx.chat.type !== "private") return next();

  // دکمه تأیید عضویت جداگانه هندل می‌شود
  if (ctx.callbackQuery?.data === "fj:check") return next();

  // آپدیت‌های سیستمی / کانال
  if (
    ctx.channelPost ||
    ctx.editedChannelPost ||
    ctx.myChatMember ||
    ctx.chatMember ||
    ctx.inlineQuery ||
    ctx.chosenInlineResult
  ) {
    return next();
  }

  const msg = ctx.message;
  const user = await findByTelegram(from.id);
  const lang = user ? langOf(user) : await resolveLang(ctx);
  const mode: ForceJoinPromptMode = user?.registered
    ? "continue"
    : "register";

  const detail = await checkChannelMembershipDetail(ctx, from.id);
  if (detail.status === "member") return next();
  // اگر چک API شکست خورد، اسپم نکن و ربات را قفل نکن
  if (detail.status === "unknown") return next();

  // فوروارد از کانال‌های اجباری → تأیید تدریجی
  if (msg) {
    const matched = matchForwardedRequiredChannel(msg);
    if (matched) {
      markForwardVerified(from.id, matched);
      const after = await checkChannelMembershipDetail(ctx, from.id);
      if (after.status === "member") {
        await ctx.reply(
          lang === "en"
            ? "✅ Both memberships verified."
            : "✅ عضویت هر دو کانال تأیید شد.",
        );
        await resumeAfterJoin(ctx, user, lang, from);
        return;
      }
      const still = [...after.missing, ...after.unknown];
      const names =
        lang === "en"
          ? still.map((c) => c.labelEn).join(", ")
          : still.map((c) => c.labelFa).join("، ");
      await ctx.reply(
        lang === "en"
          ? `✅ ${matched.labelEn} verified. Still need: ${names}`
          : `✅ ${matched.labelFa} تأیید شد. هنوز لازم است: ${names}`,
        { reply_markup: joinKeyboard(lang) },
      );
      return;
    }

    if (looksLikeForward(msg)) {
      const links = requiredChannels().map((c) => c.url).join("\n");
      await ctx.reply(
        lang === "en"
          ? `That forward is not from a required channel. Forward from:\n${links}`
          : `این فوروارد از کانال‌های اجباری نیست. از این‌ها فوروارد کن:\n${links}`,
        { reply_markup: joinKeyboard(lang) },
      );
      return;
    }
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({
      text: missingAlert(lang, detail.missing),
      show_alert: true,
    });
  }

  // فقط برای ثبت‌نام‌نشده‌ها state را force_join کن — ممبر قدیمی registered می‌ماند
  if (user && !user.registered) {
    await patchUser(user.id, { state: "force_join", registered: false });
  }

  await sendJoinPrompt(
    ctx,
    from.id,
    lang,
    mode,
    true,
    Boolean(ctx.callbackQuery),
  );
});

forceJoinHandler.callbackQuery("fj:check", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  clearForceJoinCache(from.id);
  const detail = await checkChannelMembershipDetail(ctx, from.id);
  const lang = await resolveLang(ctx);
  const dbUser = await findByTelegram(from.id);

  if (detail.status === "member") {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "✅ Both memberships confirmed"
          : "✅ عضویت هر دو کانال تأیید شد",
    });
    try {
      await ctx.deleteMessage();
    } catch {
      /* ignore */
    }
    await resumeAfterJoin(ctx, dbUser, lang, from);
    return;
  }

  if (detail.status === "not_member") {
    await ctx.answerCallbackQuery({
      text: missingAlert(lang, detail.missing),
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({
    text:
      lang === "en"
        ? "Auto-check unavailable. Forward a post from each channel."
        : "چک خودکار ممکن نیست. از هر کانال یک پست فوروارد کن.",
    show_alert: true,
  });
  await sendJoinPrompt(ctx, from.id, lang, dbUser?.registered ? "continue" : "register", true, true);
});

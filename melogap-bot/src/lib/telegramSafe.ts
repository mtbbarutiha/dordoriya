import type { Context } from "grammy";

/** خطاهای بی‌ضرر تلگرام که نباید کل هندلر را بشکنند */
export function isIgnorableTelegramError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const needles = [
    "query is too old",
    "query ID is invalid",
    "message is not modified",
    "message to edit not found",
    "message to delete not found",
    "bot was blocked by the user",
    "user is deactivated",
    "chat not found",
    "have no rights to send a message",
  ];
  return needles.some((n) => msg.includes(n));
}

/** علت واقعی عدم تحویل پیام ربات به کاربر تلگرام */
export type BotDeliveryBlockReason =
  | "blocked_bot"
  | "never_started"
  | "deactivated"
  | "forbidden"
  | null;

/**
 * فقط وقتی تلگرام صریحاً می‌گوید کاربر ربات را بلاک کرده، blocked_bot برگردان.
 * خطاهای مبهم 403 / rate-limit / chat action نباید «بلاک ربات» تلقی شوند.
 */
export function classifyBotDeliveryError(err: unknown): BotDeliveryBlockReason {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  // Telegram wording (EN): "Forbidden: bot was blocked by the user"
  if (
    lower.includes("bot was blocked by the user") ||
    lower.includes("bot was blocked by the the user") // rare typo variant
  ) {
    return "blocked_bot";
  }
  if (lower.includes("user is deactivated")) return "deactivated";
  if (lower.includes("chat not found")) return "never_started";
  if (lower.includes("have no rights to send a message")) return "forbidden";
  // Do NOT treat generic "forbidden"+"blocked" as bot-block — too many false positives.
  // Generic 403 Forbidden without explicit block wording → unknown (null), not blocked_bot.
  if (lower.includes("403") && lower.includes("forbidden")) return "forbidden";
  return null;
}

export function isStaleCallbackError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("query is too old") || msg.includes("query ID is invalid")
  );
}

/** answerCallbackQuery بدون پرتاب خطای query قدیمی */
export async function safeAnswerCallback(
  ctx: Context,
  params?: Parameters<Context["answerCallbackQuery"]>[0],
): Promise<boolean> {
  try {
    await ctx.answerCallbackQuery(params);
    return true;
  } catch (err) {
    if (isStaleCallbackError(err)) return false;
    throw err;
  }
}

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

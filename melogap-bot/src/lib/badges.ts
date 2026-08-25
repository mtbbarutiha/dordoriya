/** بج احراز چهره برای کپشن عکس پروفایل */

export function faceBadge(verified: boolean): string {
  return verified
    ? "┏━━━━ ✅ احراز‌شده ━━━━┓"
    : "┏━━━ ⛔ احراز نشده ━━━┓";
}

/** نسخه کوتاه کنار نام */
export function faceBadgeShort(verified: boolean): string {
  return verified ? "✅ احراز‌شده" : "⛔ احراز نشده";
}

/** برای پروفایل خود کاربر (pending هم جدا) */
export function ownFaceBadge(opts: {
  faceVerified: boolean;
  faceStatus?: string | null;
}): string {
  if (opts.faceVerified) return faceBadge(true);
  if (opts.faceStatus === "pending") {
    return "┏━━ ⏳ احراز در انتظار ━━┓";
  }
  return faceBadge(false);
}

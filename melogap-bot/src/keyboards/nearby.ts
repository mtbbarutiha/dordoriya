import { InlineKeyboard } from "grammy";
import { formatNum } from "../data/packages.js";
import { tr, normalizeLang, type Lang } from "../i18n/index.js";
import { threadGiftButtonLabel } from "../services/threadGift.js";

export function nearbyUserKeyboard(
  targetUserId: number,
  likesCount: number,
  inContacts = false,
  lang: Lang | string | null = "fa",
  blocked = false,
) {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard()
    .text(`❤️ ${formatNum(likesCount)}`, `exp:likes:${targetUserId}`)
    .text(threadGiftButtonLabel(L), `exp:thread:${targetUserId}`)
    .primary()
    .row()
    .text(tr(L, "🎁 هدیه سکه", "🎁 Gift coins"), `gift:menu:${targetUserId}`)
    .primary()
    .text(
      tr(L, "✉️ پیام دایرکت", "✉️ Direct message"),
      `dm:start:${targetUserId}`,
    )
    .primary()
    .row()
    .text(
      inContacts
        ? tr(L, "✅ در مخاطبین", "✅ In contacts")
        : tr(L, "➕ افزودن به مخاطبین", "➕ Add to contacts"),
      inContacts
        ? `contact:remove:${targetUserId}`
        : `contact:add:${targetUserId}`,
    )
    .success()
    .row()
    .text(
      tr(L, "❤️ لایک (+۱💰)", "❤️ Like (+1💰)"),
      `exp:like:${targetUserId}`,
    )
    .success();
  if (blocked) {
    kb.text(
      tr(L, "🔓 آنبلاک", "🔓 Unblock"),
      `block:off:${targetUserId}`,
    ).success();
  } else {
    kb.text(tr(L, "🚫 بلاک", "🚫 Block"), `block:on:${targetUserId}`).danger();
  }
  kb.row()
    .text(
      tr(
        L,
        "🔔 اطلاع پایان چت (+۱💰)",
        "🔔 Notify chat end (+1💰)",
      ),
      `watchend:ask:${targetUserId}`,
    )
    .primary()
    .row()
    .text(
      tr(L, "💬 درخواست چت", "💬 Chat request"),
      `nearby_chat:${targetUserId}`,
    )
    .primary();
  return kb;
}

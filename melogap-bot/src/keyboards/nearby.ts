import { InlineKeyboard } from "grammy";
import { formatNum } from "../data/packages.js";

export function nearbyUserKeyboard(targetUserId: number, likesCount: number) {
  return new InlineKeyboard()
    .text(`❤️ ${formatNum(likesCount)}`, `exp:likes:${targetUserId}`)
    .row()
    .text("🎁 هدیه سکه", `gift:menu:${targetUserId}`)
    .row()
    .text(`❤️ لایک (+۱🪙)`, `exp:like:${targetUserId}`)
    .text("💬 درخواست چت", `nearby_chat:${targetUserId}`);
}

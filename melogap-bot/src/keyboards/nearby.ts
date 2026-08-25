import { InlineKeyboard } from "grammy";

export function nearbyUserKeyboard(targetUserId: number) {
  return new InlineKeyboard()
    .text("چت ناشناس ⚡", `nearby_chat:${targetUserId}`)
    .row()
    .text("رد کردن", "nearby_skip");
}

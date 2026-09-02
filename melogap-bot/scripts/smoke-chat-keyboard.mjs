/**
 * Smoke tests for chat keyboard / reconcile logic (no Telegram / DB).
 * Run: node scripts/smoke-chat-keyboard.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

/** Mirror of softened reconcile rules (pure). */
function shouldWipeChatting(user, partner) {
  if (user.state !== "chatting") return false;
  if (!user.chatPartnerId) return true;
  if (!partner) return true;
  // mutual link enough — do NOT require partner.state === "chatting"
  return partner.chatPartnerId !== user.id;
}

function shouldKeepPartnerId(state) {
  return state === "chatting" || state === "await_direct_msg";
}

function shouldClearStalePartner(state, chatPartnerId) {
  if (chatPartnerId == null) return false;
  return !shouldKeepPartnerId(state);
}

/** Main-menu labels must be blocked mid-chat (not forwarded as chat text). */
const MAIN_MENU_FA = [
  "به یه ناشناس وصلم کن! 🙈",
  "افراد نزدیک 📍🛰️",
  "جستجو کاربران 🔍🗨️",
  "پروفایل 👤",
  "سکه 💰",
  "کسب درآمد 💵",
  "معرفی به دوستان (سکه رایگان) 🔗",
  "راهنما 🤔",
  "لینک ناشناس من 🎭🎭",
];

const CHAT_BTNS_FA = [
  "🔚 قطع چت",
  "👤 پروفایل طرف مقابل",
  "➕ افزودن به مخاطبین",
  "🔒 چت امن",
  "🔓 خاموش کردن چت امن",
];

function chatActionForText(state, text) {
  if (state !== "chatting") return "menu_or_other";
  if (CHAT_BTNS_FA.includes(text)) return "chat_control";
  if (MAIN_MENU_FA.includes(text)) return "block_keep_chat_kb";
  return "relay";
}

// --- reconcile / connect race ---
assert(
  shouldWipeChatting(
    { id: 1, state: "chatting", chatPartnerId: 2 },
    { chatPartnerId: 1 },
  ) === false,
  "mutual link must not wipe",
);
assert(
  shouldWipeChatting(
    { id: 1, state: "chatting", chatPartnerId: 2 },
    { state: "await_direct_msg", chatPartnerId: 1 },
  ) === false,
  "partner composing DM must not wipe chatter",
);
assert(
  shouldWipeChatting(
    { id: 1, state: "chatting", chatPartnerId: 2 },
    { state: "idle", chatPartnerId: null },
  ) === true,
  "unlinked partner must wipe",
);
assert(
  shouldClearStalePartner("await_direct_msg", 5) === false,
  "await_direct_msg keeps chatPartnerId",
);
assert(
  shouldClearStalePartner("idle", 5) === true,
  "idle clears stale partner",
);

// --- menu vs chat ---
assert(
  chatActionForText("chatting", "راهنما 🤔") === "block_keep_chat_kb",
  "guide mid-chat blocked",
);
assert(
  chatActionForText("chatting", "کسب درآمد 💵") === "block_keep_chat_kb",
  "earn mid-chat blocked",
);
assert(
  chatActionForText("chatting", "سلام") === "relay",
  "normal text relays",
);
assert(
  chatActionForText("chatting", "🔚 قطع چت") === "chat_control",
  "end chat is control",
);
assert(
  chatActionForText("idle", "راهنما 🤔") === "menu_or_other",
  "idle uses menu",
);

console.log("smoke-chat-keyboard: OK");

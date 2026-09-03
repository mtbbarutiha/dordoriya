/**
 * Smoke: silent mode must not gate DM; delivery errors must classify clearly.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function loadTsOrJs(rel) {
  const js = path.join(root, "dist", rel.replace(/\.ts$/, ".js"));
  try {
    return await import(pathToFileURL(js).href);
  } catch {
    const require = createRequire(import.meta.url);
    // fallback: not built yet
    throw new Error(`Missing ${js} — run npm run build first`);
  }
}

const { classifyBotDeliveryError } = await loadTsOrJs("lib/telegramSafe.js");
const silent = await loadTsOrJs("services/chatSilent.js");

assert.equal(
  classifyBotDeliveryError(
    new Error("Call to 'sendMessage' failed! (403: Forbidden: bot was blocked by the user)"),
  ),
  "blocked_bot",
);
assert.equal(
  classifyBotDeliveryError(new Error("403: Forbidden: user is deactivated")),
  "deactivated",
);
assert.equal(
  classifyBotDeliveryError(new Error("400: Bad Request: chat not found")),
  "never_started",
);
assert.equal(classifyBotDeliveryError(new Error("timeout")), null);

const forever = new Date("9999-12-31T23:59:59.000Z");
assert.equal(silent.isChatSilent({ chatSilentUntil: forever }), true);
assert.equal(silent.isChatSilent({ chatSilentUntil: null }), false);
assert.equal(silent.isChatSilent({ chatSilentUntil: new Date(0) }), false);

const text = silent.silentRejectMessage("تست", "fa");
assert.match(text, /پیام دایرکت/);
assert.match(text, /نه دایرکت|سایلنت فقط/);

console.log("smoke-direct-msg-silent: ok");

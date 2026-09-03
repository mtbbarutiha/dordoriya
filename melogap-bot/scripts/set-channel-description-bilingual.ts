/**
 * Set @dordoriabot description (FA+EN). Safe to re-run; does not post or pin.
 *
 * Live pin (do not republish): https://t.me/dordoriabot/223
 * Button: «ورود به ربات / Open Bot» → https://t.me/Dordoriya_bot
 *
 * Usage: npx tsx scripts/set-channel-description-bilingual.ts
 * Requires: bot admin with can_change_info.
 */
import "dotenv/config";
import { Bot } from "grammy";

const CHAT =
  process.env.FORCE_JOIN_CHAT_ID ||
  process.env.FORCE_JOIN_CHANNEL ||
  "@dordoriabot";

const CHANNEL_DESCRIPTION = [
  "دوردوریا — جایی برای گپ ناشناس با نزدیک‌ها، دایرکت و ویس.",
  "سکه بگیر و دوستات رو دعوت کن.",
  "",
  "Dordoriya — anonymous chat, nearby, coins & invites.",
  "@Dordoriya_bot",
].join("\n");

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");
  if (CHANNEL_DESCRIPTION.length > 255) {
    throw new Error(
      `description too long: ${CHANNEL_DESCRIPTION.length} (max 255)`,
    );
  }

  const bot = new Bot(token);
  const me = await bot.api.getMe();
  const member = await bot.api.getChatMember(CHAT, me.id);
  if (member.status !== "administrator" && member.status !== "creator") {
    throw new Error(
      `Bot @${me.username} is not admin in ${CHAT} (status: ${member.status})`,
    );
  }

  try {
    await bot.api.setChatDescription(CHAT, CHANNEL_DESCRIPTION);
  } catch (err: unknown) {
    const text = err instanceof Error ? err.message : String(err);
    if (!/not modified/i.test(text)) throw err;
    console.log("description unchanged");
  }

  const chat = await bot.api.getChat(CHAT);
  if ("description" in chat) {
    console.log("description:\n" + chat.description);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

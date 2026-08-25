import "dotenv/config";
import { createBot } from "./bot.js";
import { setupBotMenu } from "./botMenu.js";
import { prisma } from "./db/prisma.js";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token || token === "your_telegram_bot_token_here") {
    console.error(
      "BOT_TOKEN را در فایل .env تنظیم کن (از @BotFather بگیر).",
    );
    process.exit(1);
  }

  await prisma.$connect();
  console.log("Database connected.");
  const { backfillMissingUserCodes } = await import("./db/users.js");
  const filled = await backfillMissingUserCodes();
  if (filled) console.log(`Backfilled ${filled} userCode(s).`);

  for (let attempt = 1; attempt <= 5; attempt++) {
    const bot = createBot(token);
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      await setupBotMenu(bot);
      console.log("Bot menu commands registered.");
      await bot.start({
        drop_pending_updates: true,
        onStart: (info) => {
          console.log(`Bot @${info.username} is running. (attempt ${attempt})`);
        },
      });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Start failed (attempt ${attempt}):`, msg);
      if (attempt === 5) throw err;
      const wait = attempt * 5000;
      console.log(`Waiting ${wait / 1000}s before retry...`);
      await sleep(wait);
    }
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

process.once("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

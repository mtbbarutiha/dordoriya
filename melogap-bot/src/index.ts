import "dotenv/config";
import fs from "node:fs";
import { createBot } from "./bot.js";
import { setupBotMenu } from "./botMenu.js";
import { prisma } from "./db/prisma.js";

const PID_FILE = "/tmp/melogap-bot.pid";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function acquirePidLock() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const old = Number(fs.readFileSync(PID_FILE, "utf8").trim());
      if (old && old !== process.pid) {
        try {
          process.kill(old, 0);
          console.error(
            `نمونه دیگری در حال اجراست (pid=${old}). همان را نگه می‌داریم یا اول متوقف کن.`,
          );
          // تلاش برای بستن نمونه قبلی روی همین ماشین
          try {
            process.kill(old, "SIGTERM");
            console.log(`SIGTERM به pid=${old} ارسال شد.`);
          } catch {
            /* ignore */
          }
        } catch {
          // پروسه مرده — قفل کهنه
        }
      }
    }
  } catch {
    /* ignore */
  }
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function releasePidLock() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const cur = Number(fs.readFileSync(PID_FILE, "utf8").trim());
      if (cur === process.pid) fs.unlinkSync(PID_FILE);
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token || token === "your_telegram_bot_token_here") {
    console.error(
      "BOT_TOKEN را در فایل .env تنظیم کن (از @BotFather بگیر).",
    );
    process.exit(1);
  }

  acquirePidLock();
  await sleep(1500); // فرصت بده getUpdates قبلی آزاد شود

  await prisma.$connect();
  console.log("Database connected.");
  const { backfillMissingUserCodes } = await import("./db/users.js");
  const filled = await backfillMissingUserCodes();
  if (filled) console.log(`Backfilled ${filled} userCode(s).`);

  for (let attempt = 1; attempt <= 8; attempt++) {
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
      const conflict = msg.includes("409") || msg.toLowerCase().includes("conflict");
      if (attempt === 8) throw err;
      const wait = conflict ? Math.min(30000, attempt * 4000) : attempt * 3000;
      console.log(`Waiting ${wait / 1000}s before retry...`);
      await sleep(wait);
    }
  }
}

main().catch(async (err) => {
  console.error(err);
  releasePidLock();
  await prisma.$disconnect();
  process.exit(1);
});

async function shutdown() {
  releasePidLock();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

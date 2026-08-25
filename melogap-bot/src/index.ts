import "dotenv/config";
import { createBot } from "./bot.js";
import { prisma } from "./db/prisma.js";

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token || token === "your_telegram_bot_token_here") {
    console.error(
      "BOT_TOKEN را در فایل .env تنظیم کن (از @BotFather بگیر).",
    );
    process.exit(1);
  }

  const bot = createBot(token);

  await prisma.$connect();
  console.log("Database connected.");

  await bot.start({
    onStart: (info) => {
      console.log(`Bot @${info.username} is running.`);
    },
  });
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

process.once("SIGINT", () => prisma.$disconnect());
process.once("SIGTERM", () => prisma.$disconnect());

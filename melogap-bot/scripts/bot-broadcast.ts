/**
 * In-bot scheduled broadcasts — brings users back into the bot at a set hour.
 *
 * Separate from the channel gateway on purpose: this writes DMs to real users,
 * so it is paced, skips people who are mid-chat, and refuses to hit the same
 * user twice within MIN_GAP_HOURS even if a queue item is duplicated.
 *
 * Queue: data/bot-broadcast-queue.json (override with BROADCAST_QUEUE)
 *   [{ id, at: "2026-09-21T21:45:00+03:30", label, text, button?, audience? }]
 *
 * audience:
 *   "all"        registered users (default)
 *   "inactive7d" users with no activity for 7+ days — re-engagement
 *
 * Usage:
 *   npx tsx scripts/bot-broadcast.ts --list
 *   npx tsx scripts/bot-broadcast.ts --dry-run          # counts recipients only
 *   npx tsx scripts/bot-broadcast.ts --only 8910705725  # smoke-test one account
 *   npx tsx scripts/bot-broadcast.ts                    # send whatever is due
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Bot, InlineKeyboard, GrammyError } from "grammy";
import { prisma } from "../src/db/prisma.js";

/** seeded demo profiles live above this id and must never be messaged */
const FAKE_TG_MIN = 9_000_000_000n;
/** never DM the same user twice inside this window */
const MIN_GAP_HOURS = 20;
/** ~25 messages/second */
const SEND_GAP_MS = 40;

type Audience = "all" | "inactive7d";

interface BroadcastItem {
  id: string;
  /** ISO timestamp with explicit offset, e.g. 2026-09-21T21:45:00+03:30 */
  at: string;
  label: string;
  text: string;
  /** "LABEL=URL" */
  button?: string;
  audience?: Audience;
  posted?: boolean;
  postedAt?: string;
  stats?: { sent: number; failed: number; skipped: number };
  error?: string;
}

const ROOT = path.resolve(import.meta.dirname, "..");

function queuePath(): string {
  return process.env.BROADCAST_QUEUE || path.join(ROOT, "data", "bot-broadcast-queue.json");
}

function sentLogPath(): string {
  return path.join(ROOT, "data", "bot-broadcast-sent.json");
}

function loadQueue(): BroadcastItem[] {
  const file = queuePath();
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`invalid broadcast queue: ${file}`);
  return parsed as BroadcastItem[];
}

function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function loadSentLog(): Record<string, string> {
  const file = sentLogPath();
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
}

function keyboard(spec?: string): InlineKeyboard | undefined {
  if (!spec) return undefined;
  const eq = spec.indexOf("=");
  if (eq < 0) throw new Error(`button must be LABEL=URL, got: ${spec}`);
  return new InlineKeyboard().url(spec.slice(0, eq), spec.slice(eq + 1));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isBlocked(err: unknown): boolean {
  if (!(err instanceof GrammyError)) return false;
  const d = err.description.toLowerCase();
  return (
    err.error_code === 403 ||
    d.includes("bot was blocked") ||
    d.includes("user is deactivated") ||
    d.includes("chat not found")
  );
}

function retryAfterMs(err: unknown): number | null {
  if (err instanceof GrammyError && err.error_code === 429) {
    const wait = err.parameters?.retry_after;
    if (wait != null) return (wait + 1) * 1000;
  }
  return null;
}

async function recipients(audience: Audience) {
  const where: Record<string, unknown> = {
    registered: true,
    deletedAt: null,
    bannedAt: null,
    telegramId: { lt: FAKE_TG_MIN },
  };
  if (audience === "inactive7d") {
    where.lastActiveAt = { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  }
  return prisma.user.findMany({
    where,
    select: {
      id: true,
      telegramId: true,
      state: true,
      chatPartnerId: true,
      lastActiveAt: true,
    },
    orderBy: { lastActiveAt: "desc" },
  });
}

async function run(
  item: BroadcastItem,
  dryRun: boolean,
  only?: bigint,
): Promise<void> {
  const audience = item.audience ?? "all";
  const list = await recipients(audience);
  const sentLog = loadSentLog();
  const cutoff = Date.now() - MIN_GAP_HOURS * 60 * 60 * 1000;

  const targets = list.filter((u) => {
    if (only != null) return u.telegramId === only;
    // never interrupt an open conversation
    if (u.state === "chatting" && u.chatPartnerId != null) return false;
    const last = sentLog[String(u.id)];
    if (last && Date.parse(last) > cutoff) return false;
    return true;
  });
  const skipped = list.length - targets.length;

  if (dryRun) {
    console.log(
      `[dryRun] ${item.id} audience=${audience} eligible=${list.length} targets=${targets.length} skipped=${skipped}`,
    );
    return;
  }

  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");
  const bot = new Bot(token);
  const kb = keyboard(item.button);

  let sent = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const u of targets) {
    try {
      await bot.api.sendMessage(Number(u.telegramId), item.text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(kb ? { reply_markup: kb } : {}),
      });
      sent++;
      sentLog[String(u.id)] = now;
    } catch (err) {
      const wait = retryAfterMs(err);
      if (wait) {
        await sleep(wait);
        try {
          await bot.api.sendMessage(Number(u.telegramId), item.text, {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            ...(kb ? { reply_markup: kb } : {}),
          });
          sent++;
          sentLog[String(u.id)] = now;
          continue;
        } catch {
          failed++;
          continue;
        }
      }
      // blocked/deactivated users are expected noise, not an error
      if (!isBlocked(err)) {
        console.error(`send failed user=${u.id}: ${err instanceof Error ? err.message : err}`);
      }
      failed++;
    }
    await sleep(SEND_GAP_MS);
  }

  if (only != null) {
    // smoke test: do not record progress or burn the 20h guard
    console.log(`[only ${only}] sent=${sent} failed=${failed}`);
    return;
  }
  writeJson(sentLogPath(), sentLog);
  item.posted = true;
  item.postedAt = now;
  item.stats = { sent, failed, skipped };
  delete item.error;
  console.log(`broadcast ${item.id}: sent=${sent} failed=${failed} skipped=${skipped}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const onlyArg = argv[argv.indexOf("--only") + 1];
  const only = argv.includes("--only") && onlyArg ? BigInt(onlyArg) : undefined;
  const items = loadQueue();

  if (argv.includes("--list")) {
    for (const i of items) {
      const state = i.posted
        ? `sent=${i.stats?.sent ?? "?"} failed=${i.stats?.failed ?? "?"}`
        : i.error
          ? `error: ${i.error}`
          : "pending";
      console.log(
        `${i.at}  ${(i.audience ?? "all").padEnd(10)}  ${i.id.padEnd(30)}  ${state}`,
      );
    }
    await prisma.$disconnect();
    return;
  }

  const now = Date.now();
  // a smoke test targets the next pending item regardless of its schedule
  const due =
    only != null
      ? items.filter((i) => !i.posted).slice(0, 1)
      : items.filter((i) => !i.posted && Date.parse(i.at) <= now);
  if (!due.length) {
    const next = items
      .filter((i) => !i.posted)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    console.log(next ? `nothing due; next is ${next.id} at ${next.at}` : "queue empty");
    await prisma.$disconnect();
    return;
  }

  due.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const item of due) {
    try {
      await run(item, dryRun, only);
    } catch (err) {
      item.error = err instanceof Error ? err.message : String(err);
      console.error(`ERROR ${item.id}: ${item.error}`);
    }
  }
  if (!dryRun) writeJson(queuePath(), items);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

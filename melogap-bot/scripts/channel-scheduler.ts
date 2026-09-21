/**
 * Channel scheduler — publishes queued posts at their exact Tehran times.
 *
 * The Bot API cannot schedule messages, so cron runs this every few minutes and
 * it publishes whatever is due. Photo/text still go through the channelPublish
 * dedupe gateway; polls use sendPoll then register in the same log.
 *
 * Queue: data/channel-queue.json (override with CHANNEL_QUEUE)
 *   [{ id, at: "2026-09-23T13:00:00+03:30", type: "photo"|"text"|"poll", ... }]
 *
 * Usage:
 *   npx tsx scripts/channel-scheduler.ts            # publish everything due
 *   npx tsx scripts/channel-scheduler.ts --list     # show queue state
 *   npx tsx scripts/channel-scheduler.ts --dry-run  # due items, no sending
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Bot, InlineKeyboard } from "grammy";
import {
  buildFingerprint,
  channelPublish,
  DEFAULT_CHANNEL,
  formatResult,
  normalizeCaption,
  seedPublishLog,
} from "./lib/channelPublish.ts";

type QueueType = "photo" | "text" | "poll";

interface QueueItem {
  id: string;
  /** ISO timestamp with explicit offset, e.g. 2026-09-23T13:00:00+03:30 */
  at: string;
  type: QueueType;
  label: string;
  caption?: string;
  media?: string;
  question?: string;
  options?: string[];
  /** "LABEL=URL" */
  button?: string;
  posted?: boolean;
  postedAt?: string;
  messageId?: number | null;
  error?: string;
}

const ROOT = path.resolve(import.meta.dirname, "..");

function queuePath(): string {
  return process.env.CHANNEL_QUEUE || path.join(ROOT, "data", "channel-queue.json");
}

function loadQueue(): QueueItem[] {
  const file = queuePath();
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`invalid queue file: ${file}`);
  return parsed as QueueItem[];
}

function saveQueue(items: QueueItem[]): void {
  const file = queuePath();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function keyboard(spec?: string): InlineKeyboard | undefined {
  if (!spec) return undefined;
  const eq = spec.indexOf("=");
  if (eq < 0) throw new Error(`button must be LABEL=URL, got: ${spec}`);
  return new InlineKeyboard().url(spec.slice(0, eq), spec.slice(eq + 1));
}

function resolveMedia(media: string): string {
  return path.isAbsolute(media) ? media : path.join(ROOT, media);
}

function stamp(): string {
  return new Date().toISOString();
}

async function publishPoll(item: QueueItem): Promise<number> {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");
  if (!item.question || !item.options?.length) {
    throw new Error(`poll ${item.id} needs question and options`);
  }
  const bot = new Bot(token);
  const sent = await bot.api.sendPoll(DEFAULT_CHANNEL, item.question, item.options, {
    is_anonymous: true,
    allows_multiple_answers: false,
  });
  const captionNorm = normalizeCaption([item.question, ...item.options].join(" | "));
  seedPublishLog({
    message_id: sent.message_id,
    fingerprint: buildFingerprint(captionNorm, null, "text"),
    captionNorm,
    mediaHash: null,
    mediaName: null,
    kind: "text",
    chatId: String(DEFAULT_CHANNEL),
    label: item.label,
  });
  return sent.message_id;
}

async function publish(item: QueueItem, dryRun: boolean): Promise<void> {
  if (item.type === "poll") {
    if (dryRun) {
      console.log(`[dryRun] poll ${item.id} — ${item.question}`);
      return;
    }
    const messageId = await publishPoll(item);
    item.posted = true;
    item.postedAt = stamp();
    item.messageId = messageId;
    console.log(`published poll ${item.id} → https://t.me/dordoriabot/${messageId}`);
    return;
  }

  const result = await channelPublish({
    kind: item.type,
    caption: item.caption,
    ...(item.media ? { mediaPath: resolveMedia(item.media) } : {}),
    ...(keyboard(item.button) ? { replyMarkup: keyboard(item.button)! } : {}),
    label: item.label,
    dryRun,
  });

  if (!result.ok) {
    item.error = result.reason;
    console.error(`FAILED ${item.id}: ${formatResult(result)}`);
    return;
  }
  if (dryRun) {
    console.log(`[dryRun] ${item.id} — ${formatResult(result)}`);
    return;
  }
  item.posted = true;
  item.postedAt = stamp();
  item.messageId = result.messageId;
  delete item.error;
  console.log(`published ${item.id} → https://t.me/dordoriabot/${result.messageId}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const items = loadQueue();

  if (argv.includes("--list")) {
    for (const i of items) {
      const state = i.posted ? `posted ${i.messageId}` : i.error ? `error: ${i.error}` : "pending";
      console.log(`${i.at}  ${i.type.padEnd(5)}  ${i.id.padEnd(28)}  ${state}`);
    }
    return;
  }

  const now = Date.now();
  const due = items.filter((i) => !i.posted && Date.parse(i.at) <= now);
  if (!due.length) {
    const next = items.filter((i) => !i.posted).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    console.log(next ? `nothing due; next is ${next.id} at ${next.at}` : "queue empty");
    return;
  }

  due.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const item of due) {
    try {
      await publish(item, dryRun);
    } catch (err) {
      item.error = err instanceof Error ? err.message : String(err);
      console.error(`ERROR ${item.id}: ${item.error}`);
    }
  }
  if (!dryRun) saveQueue(items);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

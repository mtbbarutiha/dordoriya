throw new Error("BLOCKED: teaser already live at https://t.me/dordoriabot/218 — do not republish");
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Bot, InlineKeyboard, InputFile } from "grammy";

const CHAT = process.env.FORCE_JOIN_CHAT_ID || process.env.FORCE_JOIN_CHANNEL || "@dordoriabot";
const BOT_LINK = "https://t.me/Dordoriya_bot";
const FILE = path.resolve(process.cwd(), "assets/banners/channel-posts/channel-earn-teaser-pro.mp4");
const THUMB = path.resolve(process.cwd(), "assets/banners/channel-posts/earn-teaser-pro/composed/02_hook.png");
const CAPTION = [
  "از خونه، بدون خروج ✨",
  "",
  "روزی ۴۰ دعوت → حدود ماهی ۳۰ میلیون تومان",
  "۲۵ سکه × ۴۰ × ۱٬۰۰۰ تومان",
  "",
  "معرفی دوستان ← سکه ← کسب درآمد ← فروش/کارت",
  "",
  "دوردوریا",
  BOT_LINK,
].join("\n");

function probe(file: string) {
  return JSON.parse(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration,size:stream=codec_type,codec_name,width,height","-of","json",file],{encoding:"utf8"}));
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");
  if (!fs.existsSync(FILE)) throw new Error(`video missing: ${FILE}`);
  const info = probe(FILE);
  const duration = Math.round(Number(info.format.duration));
  const hasAudio = info.streams.some((s: any) => s.codec_type === "audio");
  const video = info.streams.find((s: any) => s.codec_type === "video");
  if (!hasAudio) throw new Error("no audio");
  if (!video || video.width !== 1080 || video.height !== 1920) throw new Error(`bad size ${video?.width}x${video?.height}`);
  if (duration < 20 || duration > 45) throw new Error(`bad duration ${duration}`);
  const chatStr = String(CHAT);
  if (!chatStr.includes("dordoriabot") && !chatStr.startsWith("-100")) throw new Error(`bad chat ${CHAT}`);

  const kb = new InlineKeyboard().url("شروع در دوردوریا", BOT_LINK);
  const bot = new Bot(token);
  console.log(`posting pro teaser ONCE → ${CHAT}`);
  console.log(`duration=${duration}s audio=${hasAudio} sizeMB=${(Number(info.format.size)/(1024*1024)).toFixed(2)}`);

  const opts: any = { caption: CAPTION, reply_markup: kb, supports_streaming: true, duration, width: 1080, height: 1920 };
  if (fs.existsSync(THUMB)) opts.thumbnail = new InputFile(THUMB);
  const sent = await bot.api.sendVideo(CHAT, new InputFile(FILE), opts);
  console.log("ok message_id", sent.message_id);
  console.log(`https://t.me/dordoriabot/${sent.message_id}`);
}
main().catch((e)=>{console.error(e); process.exit(1);});

import fs from "node:fs/promises";
import sharp from "sharp";
import { InputFile } from "grammy";
import type { Api } from "grammy";
import { defaultAvatarPath } from "./avatars.js";

const FONT =
  "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf";

export type FaceBadgeKind = "verified" | "unverified" | "pending";

type PhotoUser = {
  gender?: string | null;
  photoFileId?: string | null;
  photoPendingFileId?: string | null;
  photoStatus?: string | null;
  faceVerified?: boolean | null;
  faceStatus?: string | null;
};

/** بج کوچک و نیمه‌شفاف گوشه بالا-راست — ویژه = سبز شفاف */
function badgeSvg(kind: FaceBadgeKind, width: number, height: number): string {
  const colors =
    kind === "verified"
      ? { a: "#22c55e", b: "#15803d", fg: "#ecfdf5" }
      : kind === "pending"
        ? { a: "#94a3b8", b: "#64748b", fg: "#f8fafc" }
        : { a: "#64748b", b: "#475569", fg: "#f1f5f9" };

  const label =
    kind === "verified"
      ? "کاربر ویژه"
      : kind === "pending"
        ? "در انتظار"
        : "کاربر ناشناس";

  const cx = Math.round(width * 0.14);
  const cy = Math.round(height * 0.5);
  const r = Math.round(height * 0.28);
  const pillOpacity = kind === "verified" ? "0.42" : "0.52";

  const icon =
    kind === "verified"
      ? `<polygon points="${cx},${cy - r * 0.85} ${cx + r * 0.25},${cy - r * 0.2} ${cx + r * 0.9},${cy - r * 0.2} ${cx + r * 0.35},${cy + r * 0.2} ${cx + r * 0.55},${cy + r * 0.85} ${cx},${cy + r * 0.4} ${cx - r * 0.55},${cy + r * 0.85} ${cx - r * 0.35},${cy + r * 0.2} ${cx - r * 0.9},${cy - r * 0.2} ${cx - r * 0.25},${cy - r * 0.2}" fill="${colors.a}"/>`
      : kind === "pending"
        ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" stroke="${colors.a}" stroke-width="${Math.max(1.5, height * 0.06)}"/><circle cx="${cx}" cy="${cy - r * 0.15}" r="${r * 0.12}" fill="${colors.a}"/>`
        : `<ellipse cx="${cx}" cy="${cy - r * 0.05}" rx="${r * 0.85}" ry="${r * 0.38}" fill="${colors.a}"/><circle cx="${cx - r * 0.35}" cy="${cy - r * 0.05}" r="${r * 0.18}" fill="white" opacity="0.9"/><circle cx="${cx + r * 0.35}" cy="${cy - r * 0.05}" r="${r * 0.18}" fill="white" opacity="0.9"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'NotoAr';
        src: url('file://${FONT}');
      }
    </style>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors.a}"/>
      <stop offset="100%" stop-color="${colors.b}"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${height / 2}"
    fill="url(#g)" opacity="${pillOpacity}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="white" opacity="0.72"/>
  ${icon}
  <text x="${Math.round(width * 0.58)}" y="${Math.round(height * 0.66)}" text-anchor="middle"
    font-family="NotoAr, Noto Sans Arabic" font-size="${Math.round(height * 0.36)}" font-weight="700"
    fill="${colors.fg}" opacity="0.92" direction="rtl">${label}</text>
</svg>`;
}

export function faceBadgeKind(
  user: {
    faceVerified?: boolean | null;
    faceStatus?: string | null;
  },
  forSelf = false,
): FaceBadgeKind {
  if (user.faceVerified) return "verified";
  if (forSelf && user.faceStatus === "pending") return "pending";
  return "unverified";
}

/** لایه سبز شفاف روی کل عکس برای کاربر ویژه */
function greenWashSvg(w: number, h: number): Buffer {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="#22c55e" opacity="0.22"/>
</svg>`;
  return Buffer.from(svg);
}

export async function overlayFaceBadge(
  image: Buffer,
  kind: FaceBadgeKind,
): Promise<Buffer> {
  const meta = await sharp(image).rotate().metadata();
  const w = meta.width ?? 512;
  const h = meta.height ?? 512;
  const badgeH = Math.max(22, Math.round(Math.min(w, h) * 0.065));
  const badgeW = Math.round(badgeH * 4.6);
  const margin = Math.max(6, Math.round(Math.min(w, h) * 0.028));

  const badge = await sharp(Buffer.from(badgeSvg(kind, 300, 64)))
    .resize(badgeW, badgeH)
    .png()
    .toBuffer();

  const layers: { input: Buffer; top: number; left: number; blend: "over" }[] =
    [];
  if (kind === "verified") {
    layers.push({
      input: await sharp(greenWashSvg(w, h)).png().toBuffer(),
      top: 0,
      left: 0,
      blend: "over",
    });
  }
  layers.push({
    input: badge,
    top: margin,
    left: Math.max(0, w - badgeW - margin),
    blend: "over",
  });

  return sharp(image)
    .rotate()
    .composite(layers)
    .jpeg({ quality: 88 })
    .toBuffer();
}

/** تصویر فشرده برای لیست سرچ */
export async function listThumbWithBadge(
  api: Api,
  user: PhotoUser,
  size = 360,
): Promise<InputFile> {
  const raw = await loadUserPhotoBuffer(api, user, "public");
  const kind = faceBadgeKind(user, false);
  const squared = await sharp(raw)
    .rotate()
    .resize(size, size, { fit: "cover", position: "centre" })
    .jpeg({ quality: 82 })
    .toBuffer();
  const out = await overlayFaceBadge(squared, kind);
  return new InputFile(out, "list.jpg");
}

async function downloadTelegramFile(api: Api, fileId: string): Promise<Buffer> {
  const file = await api.getFile(fileId);
  if (!file.file_path) throw new Error("file_path missing");
  const url = `https://api.telegram.org/file/bot${api.token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function loadUserPhotoBuffer(
  api: Api,
  user: PhotoUser,
  mode: "public" | "own",
): Promise<Buffer> {
  if (user.photoStatus === "approved" && user.photoFileId) {
    return downloadTelegramFile(api, user.photoFileId);
  }
  if (
    mode === "own" &&
    user.photoStatus === "pending" &&
    user.photoPendingFileId
  ) {
    return downloadTelegramFile(api, user.photoPendingFileId);
  }
  return fs.readFile(defaultAvatarPath(user.gender));
}

export async function publicPhotoWithBadge(
  api: Api,
  user: PhotoUser,
): Promise<InputFile> {
  const raw = await loadUserPhotoBuffer(api, user, "public");
  const out = await overlayFaceBadge(raw, faceBadgeKind(user, false));
  return new InputFile(out, "profile.jpg");
}

export async function ownPhotoWithBadge(
  api: Api,
  user: PhotoUser,
): Promise<InputFile> {
  const raw = await loadUserPhotoBuffer(api, user, "own");
  const out = await overlayFaceBadge(raw, faceBadgeKind(user, true));
  return new InputFile(out, "profile.jpg");
}

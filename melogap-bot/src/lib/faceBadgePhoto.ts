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

/** بج کوچک و نیمه‌شفاف گوشه بالا-راست */
function badgeSvg(kind: FaceBadgeKind, width: number, height: number): string {
  const colors =
    kind === "verified"
      ? { a: "#f59e0b", b: "#d97706", fg: "#fff7ed" }
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

  // ⭐ ستاره برای ویژه | 🕶 عینک برای ناشناس | ⏳ نقطه برای انتظار
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
    fill="url(#g)" opacity="0.52"/>
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

export async function overlayFaceBadge(
  image: Buffer,
  kind: FaceBadgeKind,
): Promise<Buffer> {
  const meta = await sharp(image).rotate().metadata();
  const w = meta.width ?? 512;
  const h = meta.height ?? 512;
  // کوچک‌تر از قبل (~۶٫۵٪ ارتفاع)
  const badgeH = Math.max(22, Math.round(Math.min(w, h) * 0.065));
  const badgeW = Math.round(badgeH * 4.6);
  const margin = Math.max(6, Math.round(Math.min(w, h) * 0.028));

  const badge = await sharp(Buffer.from(badgeSvg(kind, 300, 64)))
    .resize(badgeW, badgeH)
    .png()
    .toBuffer();

  return sharp(image)
    .rotate()
    .composite([
      {
        input: badge,
        top: margin,
        left: Math.max(0, w - badgeW - margin),
        blend: "over",
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
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

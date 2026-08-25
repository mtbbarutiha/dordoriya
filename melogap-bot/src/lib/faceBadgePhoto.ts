import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { InputFile } from "grammy";
import type { Api } from "grammy";
import { defaultAvatarPath } from "./avatars.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

function badgeSvg(kind: FaceBadgeKind, width: number, height: number): string {
  const colors =
    kind === "verified"
      ? { a: "#10b981", b: "#047857", mark: "#047857" }
      : kind === "pending"
        ? { a: "#f59e0b", b: "#d97706", mark: "#d97706" }
        : { a: "#64748b", b: "#475569", mark: "#475569" };

  const label =
    kind === "verified"
      ? "احراز‌شده"
      : kind === "pending"
        ? "در انتظار"
        : "احراز نشده";

  const icon =
    kind === "verified"
      ? `<path d="M${Math.round(width * 0.09)} ${Math.round(height * 0.5)} l${Math.round(height * 0.12)} ${Math.round(height * 0.12)} l${Math.round(height * 0.22)} ${-Math.round(height * 0.24)}" fill="none" stroke="${colors.mark}" stroke-width="${Math.max(2.5, height * 0.08)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : kind === "pending"
        ? `<circle cx="${Math.round(width * 0.128)}" cy="${Math.round(height * 0.5)}" r="${Math.round(height * 0.12)}" fill="none" stroke="${colors.mark}" stroke-width="${Math.max(2, height * 0.07)}"/><circle cx="${Math.round(width * 0.128)}" cy="${Math.round(height * 0.5)}" r="${Math.round(height * 0.04)}" fill="${colors.mark}"/>`
        : `<path d="M${Math.round(width * 0.09)} ${Math.round(height * 0.35)} L${Math.round(width * 0.165)} ${Math.round(height * 0.65)} M${Math.round(width * 0.165)} ${Math.round(height * 0.35)} L${Math.round(width * 0.09)} ${Math.round(height * 0.65)}" fill="none" stroke="${colors.mark}" stroke-width="${Math.max(2.5, height * 0.08)}" stroke-linecap="round"/>`;

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
    <filter id="sh" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="${height / 2}" fill="url(#g)" filter="url(#sh)" opacity="0.96"/>
  <circle cx="${Math.round(width * 0.128)}" cy="${Math.round(height * 0.5)}" r="${Math.round(height * 0.3)}" fill="white" opacity="0.95"/>
  ${icon}
  <text x="${Math.round(width * 0.58)}" y="${Math.round(height * 0.64)}" text-anchor="middle"
    font-family="NotoAr, Noto Sans Arabic" font-size="${Math.round(height * 0.4)}" font-weight="700"
    fill="white" direction="rtl">${label}</text>
</svg>`;
}

export function faceBadgeKind(user: {
  faceVerified?: boolean | null;
  faceStatus?: string | null;
}, forSelf = false): FaceBadgeKind {
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
  const badgeH = Math.max(36, Math.round(Math.min(w, h) * 0.11));
  const badgeW = Math.round(badgeH * 4.4);
  const margin = Math.max(8, Math.round(Math.min(w, h) * 0.035));

  const badge = await sharp(Buffer.from(badgeSvg(kind, 320, 72)))
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

/** عکس عمومی با بج احراز روی گوشه بالا-راست */
export async function publicPhotoWithBadge(
  api: Api,
  user: PhotoUser,
): Promise<InputFile> {
  const raw = await loadUserPhotoBuffer(api, user, "public");
  const kind = faceBadgeKind(user, false);
  const out = await overlayFaceBadge(raw, kind);
  return new InputFile(out, "profile.jpg");
}

/** عکس پروفایل خود کاربر با بج */
export async function ownPhotoWithBadge(
  api: Api,
  user: PhotoUser,
): Promise<InputFile> {
  const raw = await loadUserPhotoBuffer(api, user, "own");
  const kind = faceBadgeKind(user, true);
  const out = await overlayFaceBadge(raw, kind);
  return new InputFile(out, "profile.jpg");
}

import fs from "node:fs/promises";
import sharp from "sharp";
import { InputFile } from "grammy";
import type { Api } from "grammy";
import { defaultAvatarPath } from "./avatars.js";

export type FaceBadgeKind = "verified" | "unverified" | "pending";

type PhotoUser = {
  gender?: string | null;
  photoFileId?: string | null;
  photoPendingFileId?: string | null;
  photoStatus?: string | null;
  faceVerified?: boolean | null;
  faceStatus?: string | null;
};

/**
 * فقط ایموجی روی عکس (گوشه بالا-راست).
 * سبز نیمه‌شفاف فقط پشت خود ایموجی احراز — نه روی کل عکس.
 */
function badgeSvg(kind: FaceBadgeKind, size: number): string {
  const emoji =
    kind === "verified" ? "✅" : kind === "pending" ? "⏳" : "🕶";
  const glow =
    kind === "verified"
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.42}" fill="#22c55e" opacity="0.45"/>`
      : kind === "pending"
        ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.42}" fill="#94a3b8" opacity="0.4"/>`
        : `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.42}" fill="#475569" opacity="0.35"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  ${glow}
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
    font-size="${Math.round(size * 0.58)}" font-family="Noto Color Emoji, Apple Color Emoji, Segoe UI Emoji">${emoji}</text>
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

export function faceBadgeEmoji(kind: FaceBadgeKind): string {
  if (kind === "verified") return "✅";
  if (kind === "pending") return "⏳";
  return "🕶";
}

export async function overlayFaceBadge(
  image: Buffer,
  kind: FaceBadgeKind,
): Promise<Buffer> {
  const meta = await sharp(image).rotate().metadata();
  const w = meta.width ?? 512;
  const h = meta.height ?? 512;
  const badgeSize = Math.max(36, Math.round(Math.min(w, h) * 0.12));
  const margin = Math.max(8, Math.round(Math.min(w, h) * 0.03));

  const badge = await sharp(Buffer.from(badgeSvg(kind, 128)))
    .resize(badgeSize, badgeSize)
    .png()
    .toBuffer();

  return sharp(image)
    .rotate()
    .composite([
      {
        input: badge,
        top: margin,
        left: Math.max(0, w - badgeSize - margin),
        blend: "over",
      },
    ])
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

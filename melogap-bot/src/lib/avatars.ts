import path from "node:path";
import { fileURLToPath } from "node:url";
import { InputFile } from "grammy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.resolve(__dirname, "../../assets/defaults");

export function defaultAvatarPath(gender: string | null | undefined): string {
  if (gender === "female") return path.join(DEFAULTS_DIR, "female.jpg");
  if (gender === "male") return path.join(DEFAULTS_DIR, "male.jpg");
  return path.join(DEFAULTS_DIR, "anon.jpg");
}

type PhotoUser = {
  gender?: string | null;
  photoFileId?: string | null;
  photoPendingFileId?: string | null;
  photoStatus?: string | null;
};

/** عکس عمومی: فقط تأییدشده؛ وگرنه پیش‌فرض */
export function publicPhotoInput(user: PhotoUser): string | InputFile {
  if (user.photoStatus === "approved" && user.photoFileId) {
    return user.photoFileId;
  }
  return new InputFile(defaultAvatarPath(user.gender));
}

/**
 * عکس پروفایل خود کاربر:
 * تأییدشده → همان | در انتظار → عکس pending | وگرنه پیش‌فرض
 */
export function ownPhotoInput(user: PhotoUser): string | InputFile {
  if (user.photoStatus === "approved" && user.photoFileId) {
    return user.photoFileId;
  }
  if (user.photoStatus === "pending" && user.photoPendingFileId) {
    return user.photoPendingFileId;
  }
  return new InputFile(defaultAvatarPath(user.gender));
}

export function photoStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "⏳ در انتظار تأیید ادمین";
    case "approved":
      return "✅ تأیید شده";
    case "rejected":
      return "❌ رد شده — دوباره بفرست";
    default:
      return "🖼️ عکس پیش‌فرض";
  }
}

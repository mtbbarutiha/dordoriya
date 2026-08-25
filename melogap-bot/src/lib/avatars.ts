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

/** عکس کاربر یا آواتار پیش‌فرض بر اساس جنسیت */
export function profilePhotoInput(
  photoFileId: string | null | undefined,
  gender: string | null | undefined,
): string | InputFile {
  if (photoFileId) return photoFileId;
  return new InputFile(defaultAvatarPath(gender));
}

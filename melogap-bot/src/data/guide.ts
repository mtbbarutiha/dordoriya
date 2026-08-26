import { BTN } from "../keyboards/main.js";
import {
  formatNum,
  BOOST_COST,
  BOOST_HOURS,
  WELCOME_DIAMONDS,
  LIKE_GIFT_DIAMONDS,
  REFERRAL_BONUS,
  FACE_VERIFY_REWARD,
} from "./packages.js";

/** پیام ۱ — خوش‌آمدگویی و شعار برند */
export function welcomeSloganMessage(opts?: {
  displayName?: string | null;
  city?: string | null;
  province?: string | null;
  diamonds?: number;
}): string {
  const name = opts?.displayName?.trim() || "دوست جدید";
  const loc = [opts?.city, opts?.province].filter(Boolean).join("، ");
  const gift = opts?.diamonds ?? WELCOME_DIAMONDS;

  return [
    `به دوردوریا خوش آمدی، ${name} 💞`,
    "",
    "━━━━━━━━━━━━",
    "دوردوریا جایی‌ست میان فاصله‌ها —",
    "برای حرف‌های ناشناس، دوستی‌های تازه",
    "و آدم‌هایی که شاید نزدیک‌تر از چیزی باشند که فکر می‌کنی.",
    "━━━━━━━━━━━━",
    "",
    "اینجا می‌تونی بدون لو رفتن هویتت گپ بزنی،",
    "هم‌استانی و نزدیک‌هات را پیدا کنی،",
    "و با خیال راحت‌تر آشنا بشی.",
    "",
    loc ? `🏘 ${loc}` : null,
    `🎁 هدیه ورود: ${formatNum(gift)} سکه 🪙`,
    "",
    "آماده‌ای؟ منوی پایین، کنترل پنل توست 👇",
  ]
    .filter(Boolean)
    .join("\n");
}

/** پیام ۲ — راهنمای کامل استفاده از پنل */
export function fullGuideMessage(): string {
  return [
    "📖 راهنمای استفاده از دوردوریا",
    "",
    "—— منوی اصلی ——",
    `• ${BTN.QUICK_CHAT}`,
    "  وصل تصادفی به یک ناشناس. برای قطع: «قطع چت» یا /end",
    "",
    `• ${BTN.NEARBY}`,
    "  افراد اطراف با GPS. می‌توانی لوکیشن ذخیره‌شده یا فعلی را بزنی.",
    "",
    `• ${BTN.SEARCH}`,
    "  جستجو با فیلتر: هم‌استانی، هم‌سن، جدید، محبوب، GPS و…",
    "  روی پروفایل بزن → لایک / هدیه سکه / درخواست چت",
    "",
    `• ${BTN.PROFILE}`,
    "  ویرایش نام، سن، جنسیت، بیو، علاقه‌مندی‌ها، عکس و موقعیت",
    `  احراز چهره = نشان ✅ و ${formatNum(FACE_VERIFY_REWARD)} سکه جایزه`,
    "",
    `• ${BTN.DIAMONDS}`,
    "  خرید و موجودی سکه برای لایک، هدیه و امکانات ویژه",
    "",
    `• ${BTN.REFERRAL}`,
    `  دعوت دوست = ${formatNum(REFERRAL_BONUS)} سکه رایگان برای تو`,
    "",
    `• ${BTN.ANON_LINK}`,
    "  لینک شخصی برای دریافت پیام ناشناس از دیگران",
    "",
    `• ${BTN.GUIDE}`,
    "  همین راهنما را دوباره می‌بینی",
    "",
    "—— چت ناشناس ——",
    "• متن، عکس و ویدیو قابل ارسال است",
    "• «چت امن» = عکس/ویدیو غیرقابل ذخیره و فوروارد",
    "• بعد از قطع چت می‌توانی گفتگو را برای هر دو طرف پاک کنی",
    "• درخواست چت از پروفایل نیاز به قبول طرف مقابل دارد",
    "",
    "—— سکه‌ها و امکانات ——",
    `• لایک پروفایل: ${formatNum(LIKE_GIFT_DIAMONDS)} سکه (به او هدیه می‌شود)`,
    `• شتاب‌دهی: ${formatNum(BOOST_COST)} سکه / ${BOOST_HOURS} ساعت — /boost`,
    "• اشتراک پرو: /pro",
    "",
    "—— نکات ——",
    "• هویتت در چت ناشناس لو نمی‌رود",
    "• مختصات دقیق GPS به کسی نشان داده نمی‌شود",
    "• برای شروع دوباره منو: /start",
    "",
    "دوردوریا — فاصله‌ها را کوتاه کن 💫",
  ].join("\n");
}

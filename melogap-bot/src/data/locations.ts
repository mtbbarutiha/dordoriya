/** داده مکان برای ثبت‌نام و نمایش هم‌استانی */

export const LANGUAGES = [
  { id: "fa", label: "🇮🇷 فارسی" },
  { id: "en", label: "🇬🇧 English" },
] as const;

export const COUNTRIES = [
  { id: "IR", label: "🇮🇷 ایران" },
  { id: "AF", label: "🇦🇫 افغانستان" },
  { id: "TR", label: "🇹🇷 ترکیه" },
  { id: "OTHER", label: "🌍 سایر" },
] as const;

/** استان‌های ایران + چند شهر اصلی */
export const IRAN_PROVINCES: Record<string, string[]> = {
  تهران: ["تهران", "شهریار", "اسلامشهر", "ری", "قدس", "ملارد", "پردیس", "ورامین"],
  البرز: ["کرج", "فردیس", "ساوجبلاغ", "نظرآباد", "طالقان"],
  اصفهان: ["اصفهان", "کاشان", "نجف‌آباد", "خمینی‌شهر", "شاهین‌شهر", "فولادشهر"],
  فارس: ["شیراز", "مرودشت", "جهرم", "لار", "فسا", "کازرون"],
  "خراسان رضوی": ["مشهد", "نیشابور", "سبزوار", "تربت‌حیدریه", "قوچان", "کاشمر"],
  آذربایجانشرقی: ["تبریز", "مراغه", "مرند", "میانه", "اهر"],
  آذربایجانغربی: ["ارومیه", "خوی", "مهاباد", "میاندوآب", "بوکان"],
  مازندران: ["ساری", "بابل", "آمل", "قائم‌شهر", "چالوس", "تنکابن"],
  گیلان: ["رشت", "انزلی", "لاهیجان", "آستارا", "رودسر"],
  خوزستان: ["اهواز", "آبادان", "دزفول", "ماهشهر", "خرمشهر"],
  کرمان: ["کرمان", "رفسنجان", "سیرجان", "جیرفت", "بم"],
  هرمزگان: ["بندرعباس", "میناب", "قشم", "کیش", "بندرلنگه"],
  یزد: ["یزد", "میبد", "اردکان", "تفت"],
  قم: ["قم"],
  قزوین: ["قزوین", "تاکستان", "الوند"],
  زنجان: ["زنجان", "ابهر", "خدابنده"],
  همدان: ["همدان", "ملایر", "نهاوند", "تویسرکان"],
  کرمانشاه: ["کرمانشاه", "اسلام‌آبادغرب", "سنقر"],
  کردستان: ["سنندج", "سقز", "مریوان", "بانه"],
  لرستان: ["خرم‌آباد", "بروجرد", "دورود", "الیگودرز"],
  مرکزی: ["اراک", "ساوه", "محلات", "خمین"],
  سمنان: ["سمنان", "شاهرود", "دامغان", "گرمسار"],
  گلستان: ["گرگان", "گنبد", "علی‌آباد", "بندرترکمن"],
  بوشهر: ["بوشهر", "برازجان", "کنگان", "عسلویه"],
  "چهارمحال": ["شهرکرد", "بروجن", "فارسان"],
  کهگیلویه: ["یاسوج", "دهدشت", "گچساران"],
  ایلام: ["ایلام", "دهلران", "مهران"],
  اردبیل: ["اردبیل", "مشگین‌شهر", "پارس‌آباد"],
  "خراسان شمالی": ["بجنورد", "شیروان", "اسفراین"],
  "خراسان جنوبی": ["بیرجند", "قائن", "فردوس"],
  سیستان: ["زاهدان", "زابل", "چابهار", "ایرانشهر"],
};

export const AFGHAN_PROVINCES: Record<string, string[]> = {
  کابل: ["کابل", "پغمان", "بگرامی"],
  هرات: ["هرات", "انجیل"],
  بلخ: ["مزارشریف", "بلخ"],
  قندهار: ["قندهار"],
  ننگرهار: ["جلال‌آباد"],
  سایر: ["سایر شهرها"],
};

export const TURKEY_PROVINCES: Record<string, string[]> = {
  استانبول: ["استانبول"],
  آنکارا: ["آنکارا"],
  ازمیر: ["ازمیر"],
  آنتالیا: ["آنتالیا"],
  بورسا: ["بورسا"],
  سایر: ["سایر شهرها"],
};

/** منطقه → استان‌های ایران (ثبت‌نام: اول منطقه، بعد استان = دکمه بزرگ‌تر) */
export const IRAN_REGIONS: Record<string, string[]> = {
  شمال: ["گیلان", "مازندران", "گلستان"],
  "شمال‌غرب": ["آذربایجانشرقی", "آذربایجانغربی", "اردبیل", "زنجان"],
  غرب: ["کردستان", "کرمانشاه", "همدان", "ایلام", "لرستان"],
  مرکز: ["تهران", "البرز", "قم", "قزوین", "مرکزی", "سمنان", "اصفهان", "یزد"],
  جنوب: ["فارس", "بوشهر", "هرمزگان", "خوزستان", "کهگیلویه", "چهارمحال"],
  شرق: ["خراسان رضوی", "خراسان شمالی", "خراسان جنوبی", "سیستان", "کرمان"],
};

/** برچسب دکمه منطقه با نمونه استان‌ها — تا کاربر بفهمد */
export function iranRegionChoices(): { id: string; label: string }[] {
  return Object.entries(IRAN_REGIONS).map(([id, provinces]) => {
    const sample = provinces.slice(0, 2).join("، ");
    const more = provinces.length > 2 ? "…" : "";
    return { id, label: `${id} (${sample}${more})` };
  });
}

export function iranRegions(): string[] {
  return Object.keys(IRAN_REGIONS);
}

/** از متن دکمه، شناسه منطقه را دربیار */
export function resolveIranRegion(text: string): string | null {
  if (IRAN_REGIONS[text]) return text;
  const hit = iranRegionChoices().find((c) => c.label === text);
  if (hit) return hit.id;
  // شروع با نام منطقه (سازگاری)
  for (const id of Object.keys(IRAN_REGIONS)) {
    if (text === id || text.startsWith(`${id} `) || text.startsWith(`${id}(`)) {
      return id;
    }
  }
  return null;
}

export function provincesInRegion(region: string): string[] | null {
  const id = resolveIranRegion(region) ?? region;
  return IRAN_REGIONS[id] ?? null;
}

/** متن راهنمای مرحله انتخاب منطقه ایران */
export function iranRegionPrompt(): string {
  return [
    "۳/۹ — استانت کجاست؟",
    "",
    "استان‌های ایران زیادند؛ اول منطقه‌ات را بزن",
    "تا لیست کوتاه شود، بعد استان دقیق را انتخاب کن.",
    "",
    "مثال:",
    "• تهران / کرج / اصفهان → مرکز",
    "• گیلان / مازندران → شمال",
    "• شیراز / اهواز → جنوب",
  ].join("\n");
}

export function provincesForCountry(country: string): string[] {
  if (country === "IR") return Object.keys(IRAN_PROVINCES);
  if (country === "AF") return Object.keys(AFGHAN_PROVINCES);
  if (country === "TR") return Object.keys(TURKEY_PROVINCES);
  return ["سایر"];
}

export function citiesFor(country: string, province: string): string[] {
  if (country === "IR") return IRAN_PROVINCES[province] ?? ["سایر"];
  if (country === "AF") return AFGHAN_PROVINCES[province] ?? ["سایر"];
  if (country === "TR") return TURKEY_PROVINCES[province] ?? ["سایر"];
  return ["سایر"];
}

export function countryLabel(id: string | null | undefined): string {
  return COUNTRIES.find((c) => c.id === id)?.label ?? id ?? "—";
}

export function languageLabel(id: string | null | undefined): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id ?? "—";
}

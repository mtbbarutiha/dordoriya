/**
 * ساخت ۵۰ کاربر فیک برای تست اکسپلور / نزدیک‌ها / لایک
 * اجرا: npx tsx scripts/seed-fake-users.ts
 *
 * telegramId این‌ها از ۹_۰۰۰_۰۰۰_۰۰۰ به بالاست تا پیام واقعی نگیرند.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/db/prisma.js";
import { IRAN_PROVINCES } from "../src/data/locations.js";
import { makePublicCode } from "../src/db/users.js";

const FAKE_BASE = 9_000_000_000n;
const COUNT = 50;

const FEMALE_NAMES = [
  "سارا", "نیلوفر", "مریم", "زهرا", "فاطمه", "آتنا", "پریسا", "هستی",
  "یگانه", "نازنین", "الهام", "شیدا", "مهسا", "کیمیا", "آیدا", "رها",
  "دینا", "ستایش", "ملیکا", "حنانه", "ترانه", "روژان", "آوا", "نیکا",
];

const MALE_NAMES = [
  "آرمان", "امیر", "پارسا", "کیان", "رضا", "علی", "محمد", "حسین",
  "سامان", "نیما", "آرش", "بهراد", "پویا", "سینا", "دانیال", "مانی",
  "کسری", "رادین", "یاسین", "عرفان", "شایان", "آرتین", "بردیا", "ایلیا",
];

const BIOS = [
  "دوستدار سفر و قهوه ☕",
  "اهل گپ‌زدن و فیلم 🎬",
  "ورزش و موسیقی 🎧",
  "آدم مثبت‌نگر 🌞",
  "دنبال دوست جدیدم 👋",
  "عکاس آماتور 📷",
  "کتاب‌خوان شب‌ها 📚",
  null,
  null,
  "فقط برای دوستی 🙂",
];

const LOOKING = ["female", "male", "any"] as const;

function code(prefix: string, i: number): string {
  return `${prefix}${i.toString(16).padStart(4, "0")}${randomBytes(2).toString("hex")}`;
}

function pick<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** مختصات اطراف تهران برای تست نزدیک‌ها */
function nearTehran() {
  return {
    latitude: 35.6892 + (Math.random() - 0.5) * 0.35,
    longitude: 51.389 + (Math.random() - 0.5) * 0.35,
  };
}

async function main() {
  const fakes = await prisma.user.findMany({
    where: { telegramId: { gte: FAKE_BASE } },
    select: { id: true },
  });
  const ids = fakes.map((u) => u.id);
  if (ids.length) {
    await prisma.interaction.deleteMany({
      where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] },
    });
    await prisma.exploreSeen.deleteMany({
      where: { OR: [{ viewerId: { in: ids } }, { shownId: { in: ids } }] },
    });
    await prisma.anonMessage.deleteMany({
      where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] },
    });
    await prisma.diamondOrder.deleteMany({
      where: { userId: { in: ids } },
    });
    // اگر کسی با کد دعوت فیک ثبت‌نام کرده
    await prisma.user.updateMany({
      where: { referredById: { in: ids } },
      data: { referredById: null },
    });
    const existing = await prisma.user.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`حذف فیک‌های قبلی: ${existing.count}`);
  } else {
    console.log("فیک قبلی نبود.");
  }

  const provinces = Object.entries(IRAN_PROVINCES);
  const now = new Date();
  let created = 0;

  for (let i = 1; i <= COUNT; i++) {
    const female = i % 2 === 1;
    const gender = female ? "female" : "male";
    const displayName = female ? pick(FEMALE_NAMES) : pick(MALE_NAMES);
    const [province, cities] = pick(provinces);
    const city = pick(cities);
    const faceVerified = i % 3 === 0;
    const isPro = i % 7 === 0;
    const boosted = i % 11 === 0;
    const gps = i % 4 !== 0 ? nearTehran() : { latitude: null, longitude: null };

    await prisma.user.create({
      data: {
        telegramId: FAKE_BASE + BigInt(i),
        username: `fake_user_${i}`,
        firstName: displayName,
        displayName: `${displayName}${i % 5 === 0 ? " ✨" : ""}`,
        bio: pick(BIOS),
        diamonds: randInt(5, 80),
        userCode: makePublicCode(6),
        referralCode: code("fr", i),
        anonCode: code("fa", i),
        gender,
        lookingFor: pick(LOOKING),
        age: randInt(18, 45),
        language: "fa",
        country: "IR",
        province,
        city,
        photoStatus: "none",
        faceVerified,
        faceStatus: faceVerified ? "approved" : "none",
        registered: true,
        isActive: true,
        state: "idle",
        isPro,
        boostUntil: boosted
          ? new Date(now.getTime() + 12 * 3600_000)
          : null,
        viewsCount: randInt(0, 200),
        likesCount: randInt(0, 120),
        chatsCount: randInt(0, 40),
        latitude: gps.latitude,
        longitude: gps.longitude,
        locationAt: gps.latitude != null ? now : null,
        lastActiveAt: new Date(now.getTime() - randInt(0, 72) * 3600_000),
      },
    });
    created++;
  }

  const total = await prisma.user.count({
    where: { telegramId: { gte: FAKE_BASE } },
  });
  console.log(`✅ ${created} کاربر فیک ساخته شد (جمع فیک‌ها: ${total})`);
  console.log("در اکسپلور / هم‌استانی / نزدیک‌ها قابل تست هستند.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

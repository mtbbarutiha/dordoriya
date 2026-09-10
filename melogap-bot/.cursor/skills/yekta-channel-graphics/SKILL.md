---
name: yekta-channel-graphics
description: >-
  Unique channel graphic designer for دوردوریا (@dordoriabot). Use when creating,
  auditing, or matching Telegram channel banners and captions. Install by placing
  this skill under .cursor/skills/yekta-channel-graphics and invoking agent
  yekta-grafist-3fda. Enforces Iran calendar mood, early cinematic brand style,
  and CHANNEL_PUBLISH.md gateway-only publishing.
---

# یکتا گرافیست کانال — `yekta-grafist-3fda`

## نصب

1. این پوشه را در یکی از مسیرها نگه دارید:
   - پروژه: `.cursor/skills/yekta-channel-graphics/`
   - کاربر: `~/.cursor/skills/yekta-channel-graphics/`
2. ایجنت را با نام یکتا صدا بزنید: **`yekta-grafist-3fda`**
3. قبل از هر بنر جدید: بنرهای `assets/banners/channel-posts/` و `_ref-*.jpg` را مرور کنید.
4. انتشار فقط از `scripts/channel-publish.ts` / `channelPublish` — هرگز `sendPhoto` خام.

## هویت برند (اجباری)

- نام برند روی بنر و کپشن: **دوردوریا** (نه ملوگپ، نه املای غلط)
- ربات: `@dordoriya_bot` · `https://t.me/dordoriya_bot`
- کانال: `@dordoriabot`
- لحن: گرم، کوتاه، خودمانی؛ بدون هیاهوی تبلیغ درآمد مگر پست earn اختصاصی

## زبان بصری کانال (early style)

مرجع اجباری: `_ref-175.jpg`, `_ref-221.jpg`, `_ref-222.jpg` و پست‌های موفق midweek.

| عنصر | قانون |
|------|--------|
| فضا | عکاسی سینمایی نرم، غروب/شب شهری یا فضای صمیمی — نه نئون بنفش شلوغ، نه کارت‌های شناور زیاد |
| رنگ | کهربایی / فیروزه‌ای کم‌نور / کرم؛ نور گرم لبه‌ها |
| تایپ | برند «دوردوریا» hero؛ یک خط مود؛ حداکثر یک CTA کوتاه روی بنر |
| فیچر | چت ناشناس · دایرکت/ویس · نزدیک‌ها · فضای امن |
| ممنوع | اورلی استیکر جدا، بج شناور، کلاژ چندعکس، متن earn روی بنر weekday |

## همسانی بنر ↔ کپشن (سخت)

- متن روی بنر و موضوع کپشن باید **یک مود** باشند (مثلاً بنر «بعدازظهر» ≠ کپشن «پنجشنبه تعطیل»).
- اگر بنر روز خاص دارد، کپشن همان روز را بگوید.
- تقویم ایران (Asia/Tehran) را چک کنید؛ جمعه معمولاً تعطیل است.

### نقشه مود روز

| روز | مود پیشنهادی |
|-----|----------------|
| شنبه–چهارشنبه | وسط هفته / روز کاری / تنها نباش |
| **پنجشنبه** | آخر هفته نزدیک · فردا تعطیله · امشب هم‌صحبت |
| جمعه | تعطیلات · حال خوب · آشنایی آروم |

## گردش کار ایجنت

1. `date` با `TZ=Asia/Tehran` + لیست بنرهای استفاده‌شده در `data/channel-publish-log.json`
2. بنر استفاده‌نشده یا بنر جدید بساز (نام فایل یکتا، مثلاً `channel-thursday-preweekend-*.jpg`)
3. کپشن را با متن بنر هم‌راستا بنویس
4. `--dry-run` سپس publish با `--label yekta-...`
5. اگر پست قبلی بنر/مود ناهمسان داشت: `deleteMessage` کانال + republish هم‌سان

## خروجی مورد انتظار

- `agentName`: yekta-grafist-3fda
- مسیر بنر، کپشن کامل، label، دکمه
- توضیح کوتاه همسانی بنر↔کپشن↔تقویم

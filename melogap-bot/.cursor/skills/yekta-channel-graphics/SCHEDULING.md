# زمان‌بندی کانال و پیام درون ربات

Bot API زمان‌بندی پیام ندارد، پس cron روی VPS هر ۵ دقیقه دو صف را چک می‌کند.

## دو مسیر جدا

| مسیر | اسکریپت | صف | مقصد |
|------|---------|-----|------|
| پست کانال | `scripts/channel-scheduler.ts` | `data/channel-queue.json` | `@dordoriabot` از گیت‌وی ضد تکراری |
| پیام درون ربات | `scripts/bot-broadcast.ts` | `data/bot-broadcast-queue.json` | دایرکت به کاربران دیتابیس |

cron کاربر `melogap`:

```
*/5 * * * * cd /opt/melogap-bot && /usr/bin/npx tsx scripts/channel-scheduler.ts >> /tmp/channel-scheduler.log 2>&1
*/5 * * * * cd /opt/melogap-bot && /usr/bin/npx tsx scripts/bot-broadcast.ts >> /tmp/bot-broadcast.log 2>&1
```

## صف کانال

آیتم‌ها `type` دارند: `photo` | `text` | `poll`. زمان با آفست صریح تهران نوشته می‌شود:
`"at": "2026-09-23T13:00:00+03:30"`.

نکته مهم: گیت‌وی هم کپشن یکسان و هم فایل یکسان را رد می‌کند. پس پست شبانه «موج آشنایی»
را متنی و هر شب با یک جمله متفاوت بگذار؛ بنر تازه فقط برای شب‌های خاص.

```bash
npx tsx scripts/channel-scheduler.ts --list      # وضعیت صف
npx tsx scripts/channel-scheduler.ts --dry-run   # آیتم‌های سررسیده بدون ارسال
```

## پیام درون ربات

مخاطب: `all` یا `inactive7d`. سه محافظ همیشه فعال است — کاربری که وسط چت است پیام
نمی‌گیرد، کاربر بلاک‌کرده و پروفایل‌های نمونه رد می‌شوند، و هیچ کاربری زیر ۲۰ ساعت
دو پیام نمی‌گیرد (`data/bot-broadcast-sent.json`).

```bash
npx tsx scripts/bot-broadcast.ts --list
npx tsx scripts/bot-broadcast.ts --dry-run             # فقط شمارش مخاطب
npx tsx scripts/bot-broadcast.ts --only 8910705725     # تست روی یک حساب
```

`--only` چیزی را در صف علامت‌گذاری نمی‌کند و محافظ ۲۰ ساعت را نمی‌سوزاند، پس برای
اسموک‌تست قبل از ارسال انبوه امن است.

## ریتم

روزی حداکثر دو پست کانال. پیام درون ربات حداکثر سه تا چهار بار در هفته — نه هر شب،
چون دایرکت روزانه باعث بلاک شدن ربات می‌شود. پست «کسب درآمد از دعوت» ماهی یک‌بار.

## افزودن هفته جدید

۱. اسپک بنرها را در `assets/banners/channel-posts/week-*.specs.json` بنویس
۲. `python3 assets/banners/channel-posts/compose_v2.py <specs.json>`
۳. آیتم‌ها را به دو صف اضافه کن (id یکتا)
۴. `--list` و `--dry-run` بگیر، بعد بگذار cron کار خودش را بکند

#!/usr/bin/env python3
"""One-shot Telegram Ads moderation tick for Dordoriya bot-targeted ads.

Parses account table statuses (authoritative), optionally deletes/recreates Declined,
writes /tmp/ads-moderation-tick.json.
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
# Mohammad — Personal Account (funded; org @Dordoriya_bot currently 0)
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "3VQIGO7L1hpg1h1agS2rHCCKDrfwYsC6nRk3BrB71Jw8IhaTIyjfb6s_6x_4mT7A"
)
BOTS = ["melogap", "Melochat_bot", "NashenasBot"]
CPM = "0.20"
BUDGET = "3.00"
PROMOTE = "https://t.me/Dordoriya_bot"

# Editorial-safe creatives (same pool as recreate-editorial-v3-ads.py)
CAMPAIGNS = [
    ("معرفی ربات دوردوریا", "دوردوریا رباتی برای گفت‌وگوی اجتماعی در تلگرام است. پس از ثبت‌نام می‌توانید پیام خصوصی ارسال کنید."),
    ("ارتباط متنی امن", "اگر به دنبال ارتباط متنی امن و منظم هستید، ربات دوردوریا را باز کنید و گفتگو را آغاز نمایید."),
    ("پیدا کردن افراد نزدیک", "با دوردوریا افراد نزدیک به محل زندگی خود را پیدا کنید و گفتگوی خصوصی یک‌به‌یک داشته باشید."),
    ("گفت‌وگو بر اساس استان", "در دوردوریا می‌توانید بر اساس استان گفتگو کنید تا ارتباط با کاربران هم‌منطقه آسان‌تر شود."),
    ("پیام صوتی در گفتگو", "دوردوریا افزون بر پیام متنی، امکان ارسال پیام صوتی خصوصی را نیز فراهم می‌کند. استفاده رایگان است."),
    ("ثبت‌نام آسان و رایگان", "ثبت‌نام در ربات دوردوریا ساده و رایگان است. پس از ورود، گفتگوی خصوصی را بدون هزینه شروع کنید."),
    ("حریم خصوصی در گفتگو", "دوردوریا با تأکید بر حریم خصوصی طراحی شده است تا گفتگوی یک‌به‌یک در فضای کنترل‌شده انجام شود."),
    ("ارتباط اجتماعی در تلگرام", "برای ارتباط اجتماعی سریع در تلگرام، دوردوریا را امتحان کنید. پیام‌رسانی خصوصی و فیلتر موقعیت در دسترس است."),
    ("گفتگوی خصوصی یک نفره", "گفتگوی خصوصی یک نفره در دوردوریا امکان‌پذیر است. ربات را باز کنید، پروفایل بسازید و شروع کنید."),
    ("پروفایل کاربری ساده", "با ساخت پروفایل کاربری ساده در دوردوریا، دیگران شما را راحت‌تر پیدا می‌کنند و گفتگو شکل می‌گیرد."),
    ("جستجو با فیلتر سن", "دوردوریا امکان جستجو با فیلتر سن و استان را دارد تا گفتگو با افراد مناسب‌تر انجام شود."),
    ("شروع سریع گفتگو", "ربات دوردوریا را در تلگرام باز کنید و گفتگوی اجتماعی را به‌سرعت و بدون هزینه اولیه آغاز کنید."),
    ("ربات پیام‌رسان اجتماعی", "دوردوریا یک ربات پیام‌رسان اجتماعی است برای گفتگو، پیام متنی، پیام صوتی و ارتباط محلی."),
    ("کاربران محلی و همسایه", "در دوردوریا با کاربران محلی و هم‌استان آشنا شوید و پیام خصوصی رد و بدل کنید. ثبت‌نام رایگان است."),
    ("فضای گفتگوی محترمانه", "دوردوریا فضای گفتگوی اجتماعی محترمانه فراهم می‌کند. مناسب کسانی که ارتباط ساده و امن می‌خواهند."),
    ("ارتباط بدون هزینه اولیه", "شروع کار با دوردوریا بدون هزینه اولیه است. گفتگوی خصوصی و فیلتر موقعیت در یک ربات تلگرامی."),
    ("دوردوریا برای گفتگو", "دوردوریا برای گفتگوی اجتماعی و پیام خصوصی ساخته شده است. مناسب ارتباط منظم بین کاربران تلگرام."),
    ("باز کردن ربات دوردوریا", "برای باز کردن ربات دوردوریا و آغاز گفتگوی خصوصی با کاربران نزدیک، لینک تبلیغ را در تلگرام دنبال کنید."),
]

STATUS_RE = re.compile(
    r"\b(Declined|Rejected|In Review|On Hold|Active|Completed|Stopped|Pending)\b",
    re.I,
)


def normalize_status(s: str) -> str:
    s = s.strip().title() if s else "Unknown"
    mapping = {
        "In Review": "In Review",
        "On Hold": "On Hold",
        "Declined": "Declined",
        "Rejected": "Declined",
        "Active": "Active",
        "Completed": "Completed",
        "Stopped": "Stopped",
        "Pending": "In Review",
    }
    for k, v in mapping.items():
        if s.lower() == k.lower():
            return v
    return s


async def js_check(page, selector: str) -> None:
    await page.evaluate(
        """(sel) => {
          const el = document.querySelector(sel);
          if (!el) return;
          el.checked = true;
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
        }""",
        selector,
    )


async def parse_ads(page) -> list[dict]:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    ads = await page.evaluate(
        """() => {
          const results = [];
          const links = Array.from(document.querySelectorAll("a[href*='/account/ad/']"));
          const seen = new Set();
          for (const a of links) {
            const m = (a.getAttribute('href') || '').match(/\\/account\\/ad\\/(\\d+)/);
            if (!m) continue;
            const id = m[1];
            if (seen.has(id)) continue;
            seen.add(id);
            let row = a.closest('tr, .ad-row, .table-row, .pr-table-row, li, .item') || a.parentElement;
            for (let i = 0; i < 6 && row; i++) {
              const t = (row.innerText || '').trim();
              if (t.length > 20 && t.length < 2000) break;
              row = row.parentElement;
            }
            const text = ((row && row.innerText) || a.innerText || '').replace(/\\s+/g, ' ').trim();
            results.push({ id: Number(id), href: a.getAttribute('href'), rowText: text.slice(0, 500) });
          }
          return results;
        }"""
    )
    out = []
    for ad in ads:
        m = STATUS_RE.search(ad["rowText"] or "")
        status = normalize_status(m.group(1)) if m else "Unknown"
        # title: text before t.me/
        title = ad["rowText"]
        tm = re.search(r"^(.*?)\s+t\.me/", ad["rowText"])
        if tm:
            title = tm.group(1).strip()
        out.append(
            {
                "id": ad["id"],
                "title": title,
                "status": status,
                "rowText": ad["rowText"],
            }
        )
    return out


async def delete_ad(page, ad_id: int) -> bool:
    await page.goto(
        f"https://ads.telegram.org/account/ad/{ad_id}", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(500)
    btn = page.locator("a.delete-ad-btn")
    if await btn.count() == 0:
        return False
    await btn.first.click()
    await page.wait_for_timeout(450)
    confirm = page.locator(
        ".pr-layer-delete-ad .popup-primary-btn, div.popup-button.popup-primary-btn"
    )
    if await confirm.count() == 0:
        return False
    await confirm.first.click()
    await page.wait_for_timeout(1200)
    print(f"  deleted {ad_id}")
    return True


async def add_bot_target(page, bot_query: str) -> str | None:
    wrap = page.locator(".js-field-bots-wrap .input.form-control")
    await wrap.scroll_into_view_if_needed()
    await page.evaluate(
        """() => {
          const w = document.querySelector('.js-field-bots-wrap');
          if (!w) return;
          w.querySelectorAll('.selected-item .remove, a.remove, .close').forEach(el => el.click());
          const el = w.querySelector('.input.form-control');
          if (el) { el.innerHTML=''; el.dispatchEvent(new InputEvent('input',{bubbles:true})); }
        }"""
    )
    await page.wait_for_timeout(200)
    await wrap.click()
    await wrap.type(bot_query, delay=25)
    await page.wait_for_timeout(1100)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(800)
    selected = (
        await page.locator(".js-field-bots-wrap .selected-items").inner_text()
    ).strip()
    lines = [ln.strip() for ln in selected.splitlines() if ln.strip()]
    for ln in lines:
        if ln.lower() != bot_query.lower() and not ln.startswith("http"):
            return ln
    return None


async def create_bot_ad(page, title: str, text: str, bot: str, idx: int) -> dict:
    assert "\n" not in text and len(text) <= 160
    await page.goto(
        "https://ads.telegram.org/account/ad/new", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(800)
    clear = page.get_by_text("Clear Draft", exact=True)
    if await clear.count() and await clear.first.is_visible():
        await clear.first.click()
        await page.wait_for_timeout(450)

    await page.locator("label.pr-radio-tab", has_text="Bots").first.click()
    await page.wait_for_timeout(300)
    await page.locator("input[name=title]").fill(title)
    await page.locator("textarea[name=text]").fill(text)
    await page.locator("input[name=promote_url]").fill(PROMOTE)
    await js_check(page, "input[name=picture]")
    await page.locator("input[name=cpm]").fill(CPM)
    await page.locator("input[name=budget]").fill(BUDGET)
    await js_check(page, 'input[name=views_per_user][value="4"]')
    await js_check(page, 'input[name=active][value="1"]')

    selected = await add_bot_target(page, bot)
    if not selected:
        return {"title": title, "bot": bot, "ok": False, "reason": "bot_not_found"}

    await js_check(page, "input[name=confirmed]")
    await page.evaluate(
        """() => {
          const btn = Array.from(document.querySelectorAll('button,a,input[type=submit]'))
            .find(el => /Create Ad/i.test(el.textContent || el.value || ''));
          if (btn) btn.click();
        }"""
    )
    await page.wait_for_timeout(2600)
    body = await page.locator("body").inner_text()
    ok = "Create a new ad" in body or (
        "/account/ad/" in page.url and "/new" not in page.url
    )
    if "balance is too low" in body.lower() or "Please choose target" in body:
        ok = False
    print(("OK" if ok else "FAIL"), idx, title, selected)
    return {
        "title": title,
        "text": text,
        "bot": bot,
        "selected": selected,
        "ok": ok,
    }


async def main() -> None:
    actions: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2200}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)

        ads = await parse_ads(page)
        await page.screenshot(path="/tmp/ads-moderation-overview.png", full_page=True)

        statuses: dict[str, int] = {}
        for a in ads:
            statuses[a["status"]] = statuses.get(a["status"], 0) + 1

        declined = [a for a in ads if a["status"] == "Declined"]
        in_review = [a for a in ads if a["status"] == "In Review"]
        active = [a for a in ads if a["status"] == "Active"]

        created: list[dict] = []
        deleted_ids: list[int] = []

        if declined:
            actions.append(f"delete_declined:{len(declined)}")
            for a in declined:
                ok = await delete_ad(page, a["id"])
                if ok:
                    deleted_ids.append(a["id"])

            # Recreate same count with rotating bots / campaign pool
            n = len(declined)
            actions.append(f"recreate:{n}")
            for i in range(n):
                title, text = CAMPAIGNS[i % len(CAMPAIGNS)]
                # Prefer unused titles when possible: offset by deleted id
                bot = BOTS[i % len(BOTS)]
                r = await create_bot_ad(page, title, text, bot, i + 1)
                if not r.get("ok") and r.get("reason") == "bot_not_found":
                    for alt in BOTS:
                        if alt == bot:
                            continue
                        r = await create_bot_ad(page, title, text, alt, i + 1)
                        if r.get("ok"):
                            break
                created.append(r)

            # Re-parse after recreate
            ads = await parse_ads(page)
            statuses = {}
            for a in ads:
                statuses[a["status"]] = statuses.get(a["status"], 0) + 1
            declined = [a for a in ads if a["status"] == "Declined"]
            in_review = [a for a in ads if a["status"] == "In Review"]
            active = [a for a in ads if a["status"] == "Active"]

        # Decide timer action
        all_active = len(ads) > 0 and len(active) == len(ads) and not declined and not in_review
        any_in_review = len(in_review) > 0
        if all_active:
            action = "all_active_unsubscribe"
            actions.append("unsubscribe_timer")
            timer = "unsubscribe"
        elif any_in_review or declined:
            action = "still_waiting"
            actions.append("keep_timer")
            timer = "kept_resubscribed"
        else:
            # e.g. On Hold / mixed — keep watching
            action = "still_waiting"
            actions.append("keep_timer_nonterminal")
            timer = "kept_resubscribed"

        out = {
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "statuses": statuses,
            "total": len(ads),
            "declined": [a["id"] for a in declined],
            "active": len(active),
            "in_review": len(in_review),
            "ids": [a["id"] for a in ads],
            "ads": ads,
            "deleted_ids": deleted_ids,
            "created": created,
            "actions": actions,
            "action": action,
            "timer": timer,
            "delaySeconds": 900,
            "bot_channel": "none",
        }
        Path("/tmp/ads-moderation-tick.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2)
        )
        print(json.dumps({k: out[k] for k in ("statuses", "total", "action", "timer", "actions", "declined", "active", "in_review")}, ensure_ascii=False, indent=2))
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

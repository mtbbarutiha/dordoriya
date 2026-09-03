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
# @Dordoriya_bot — Organization (not Mohammad personal)
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "1yQ7Qf4ZBdN6UNKr_se_mbjPAvIVxquj7Z2SmtLCVxw5Q-yZvduUIjnM8EVFA90o"
)
BOTS = ["melogap", "Melochat_bot", "NashenasBot"]
CPM = "0.20"
BUDGET = "3.00"
PROMOTE = "https://t.me/Dordoriya_bot"

# Editorial-safe creatives (same pool as recreate-editorial-v2-ads.py)
CAMPAIGNS = [
    ("ربات گفتگوی دوردوریا", "دوردوریا یک ربات گفتگوی اجتماعی است. می‌توانید گفتگوی خصوصی یک‌به‌یک را به‌صورت رایگان آغاز کنید."),
    ("گفتگو با کاربران نزدیک", "در دوردوریا کاربران نزدیک و هم‌استان را پیدا کنید و گفتگوی متنی خصوصی داشته باشید."),
    ("پیام خصوصی در تلگرام", "با دوردوریا پیام متنی و پیام صوتی خصوصی ارسال کنید. ثبت‌نام رایگان است و حریم خصوصی رعایت می‌شود."),
    ("فیلتر استان و سن", "دوردوریا امکان فیلتر استان و بازه سنی دارد تا گفتگو با افراد مناسب‌تر انجام شود."),
    ("شروع رایگان گفتگو", "همین حالا در ربات دوردوریا ثبت‌نام کنید و گفتگوی خصوصی را بدون هزینه آغاز کنید."),
    ("شبکه گفت‌وگوی اجتماعی", "دوردوریا شبکه گفت‌وگو و پیام‌رسانی اجتماعی در تلگرام است. مناسب ارتباط سریع و امن."),
    ("گفتگوی یک‌به‌یک امن", "برای گفتگوی یک‌به‌یک با کنترل حریم خصوصی وارد دوردوریا شوید. استفاده از ربات رایگان است."),
    ("کاربران هم‌استان", "در دوردوریا می‌توانید با کاربران هم‌استان گفتگو کنید و پیام خصوصی رد و بدل کنید."),
    ("ساخت پروفایل ساده", "پروفایل خود را در دوردوریا بسازید تا دیگران شما را بهتر پیدا کنند و گفتگو آغاز شود."),
    ("پیام صوتی خصوصی", "علاوه بر متن، در دوردوریا امکان ارسال پیام صوتی خصوصی نیز وجود دارد. ثبت‌نام رایگان است."),
    ("ارتباط سریع در تلگرام", "اگر به دنبال ارتباط سریع و منظم در تلگرام هستید، ربات دوردوریا را باز کنید و شروع کنید."),
    ("جستجوی کاربران محلی", "دوردوریا به شما کمک می‌کند کاربران محلی را پیدا کنید و گفتگوی خصوصی را آغاز نمایید."),
    ("ورود به دوردوریا", "ربات دوردوریا را باز کنید، ثبت‌نام کنید و گفتگوی اجتماعی خصوصی را شروع کنید."),
    ("گفتگو بدون هزینه شروع", "شروع کار با دوردوریا رایگان است. گفتگوی خصوصی، فیلتر موقعیت و پیام‌رسانی در یک ربات."),
    ("پیام‌رسانی اجتماعی", "دوردوریا برای پیام‌رسانی اجتماعی طراحی شده است: گفتگو، پیام متنی، پیام صوتی و فیلتر شهر."),
    ("پیدا کردن هم‌صحبت", "در دوردوریا هم‌صحبت مناسب را با فیلتر استان و سن پیدا کنید و گفتگو را آغاز کنید."),
    ("ربات چت اجتماعی", "دوردوریا ربات چت اجتماعی تلگرام است با تمرکز روی حریم خصوصی و ارتباط ساده بین کاربران."),
    ("آغاز گفتگو در دوردوریا", "برای آغاز گفتگوی خصوصی و پیدا کردن کاربران نزدیک، ربات دوردوریا را در تلگرام باز کنید."),
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

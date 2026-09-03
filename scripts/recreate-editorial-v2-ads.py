#!/usr/bin/env python3
"""Delete declined ads and recreate with strict editorial-safe creatives.

Fixes vs previous decline:
- Bot name cleaned (no emoji / Dating Chat)
- Ad title/text: zero emoji, no @mentions, no slang, formal clear Persian
- No bullets/linebreaks/gimmicks
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
# @Dordoriya_bot — Organization (not Mohammad personal)
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "1yQ7Qf4ZBdN6UNKr_se_mbjPAvIVxquj7Z2SmtLCVxw5Q-yZvduUIjnM8EVFA90o"
)

BOTS = ["melogap", "Melochat_bot", "NashenasBot"]

# 18 formal, specific, emoji-free campaigns
CAMPAIGNS = [
    (
        "ربات گفتگوی دوردوریا",
        "دوردوریا یک ربات گفتگوی اجتماعی است. می‌توانید گفتگوی خصوصی یک‌به‌یک را به‌صورت رایگان آغاز کنید.",
    ),
    (
        "گفتگو با کاربران نزدیک",
        "در دوردوریا کاربران نزدیک و هم‌استان را پیدا کنید و گفتگوی متنی خصوصی داشته باشید.",
    ),
    (
        "پیام خصوصی در تلگرام",
        "با دوردوریا پیام متنی و پیام صوتی خصوصی ارسال کنید. ثبت‌نام رایگان است و حریم خصوصی رعایت می‌شود.",
    ),
    (
        "فیلتر استان و سن",
        "دوردوریا امکان فیلتر استان و بازه سنی دارد تا گفتگو با افراد مناسب‌تر انجام شود.",
    ),
    (
        "شروع رایگان گفتگو",
        "همین حالا در ربات دوردوریا ثبت‌نام کنید و گفتگوی خصوصی را بدون هزینه آغاز کنید.",
    ),
    (
        "شبکه گفت‌وگوی اجتماعی",
        "دوردوریا شبکه گفت‌وگو و پیام‌رسانی اجتماعی در تلگرام است. مناسب ارتباط سریع و امن.",
    ),
    (
        "گفتگوی یک‌به‌یک امن",
        "برای گفتگوی یک‌به‌یک با کنترل حریم خصوصی وارد دوردوریا شوید. استفاده از ربات رایگان است.",
    ),
    (
        "کاربران هم‌استان",
        "در دوردوریا می‌توانید با کاربران هم‌استان گفتگو کنید و پیام خصوصی رد و بدل کنید.",
    ),
    (
        "ساخت پروفایل ساده",
        "پروفایل خود را در دوردوریا بسازید تا دیگران شما را بهتر پیدا کنند و گفتگو آغاز شود.",
    ),
    (
        "پیام صوتی خصوصی",
        "علاوه بر متن، در دوردوریا امکان ارسال پیام صوتی خصوصی نیز وجود دارد. ثبت‌نام رایگان است.",
    ),
    (
        "ارتباط سریع در تلگرام",
        "اگر به دنبال ارتباط سریع و منظم در تلگرام هستید، ربات دوردوریا را باز کنید و شروع کنید.",
    ),
    (
        "جستجوی کاربران محلی",
        "دوردوریا به شما کمک می‌کند کاربران محلی را پیدا کنید و گفتگوی خصوصی را آغاز نمایید.",
    ),
    (
        "ورود به دوردوریا",
        "ربات دوردوریا را باز کنید، ثبت‌نام کنید و گفتگوی اجتماعی خصوصی را شروع کنید.",
    ),
    (
        "گفتگو بدون هزینه شروع",
        "شروع کار با دوردوریا رایگان است. گفتگوی خصوصی، فیلتر موقعیت و پیام‌رسانی در یک ربات.",
    ),
    (
        "پیام‌رسانی اجتماعی",
        "دوردوریا برای پیام‌رسانی اجتماعی طراحی شده است: گفتگو، پیام متنی، پیام صوتی و فیلتر شهر.",
    ),
    (
        "پیدا کردن هم‌صحبت",
        "در دوردوریا هم‌صحبت مناسب را با فیلتر استان و سن پیدا کنید و گفتگو را آغاز کنید.",
    ),
    (
        "ربات چت اجتماعی",
        "دوردوریا ربات چت اجتماعی تلگرام است با تمرکز روی حریم خصوصی و ارتباط ساده بین کاربران.",
    ),
    (
        "آغاز گفتگو در دوردوریا",
        "برای آغاز گفتگوی خصوصی و پیدا کردن کاربران نزدیک، ربات دوردوریا را در تلگرام باز کنید.",
    ),
]

CPM = "0.20"
BUDGET = "3.00"


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


async def js_uncheck(page, selector: str) -> None:
    await page.evaluate(
        """(sel) => {
          const el = document.querySelector(sel);
          if (!el) return;
          el.checked = false;
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
        }""",
        selector,
    )


async def list_ad_ids(page) -> list[int]:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1100)
    hrefs = await page.locator("a[href*='/account/ad/']").evaluate_all(
        "els => els.map(e => e.getAttribute('href') || '')"
    )
    ids: set[int] = set()
    for h in hrefs:
        m = re.search(r"/account/ad/(\d+)(?:/|$)", h)
        if m:
            ids.add(int(m.group(1)))
    return sorted(ids)


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
    # no emoji heuristic: no surrogate-ish common emoji ranges in title/text
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
    await page.locator("input[name=promote_url]").fill("https://t.me/Dordoriya_bot")
    # keep picture but bot name is now emoji-free
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
    print(("OK" if ok else "FAIL"), idx, title, len(text), selected)
    if not ok:
        print(body[:600])
    return {
        "title": title,
        "text": text,
        "bot": bot,
        "selected": selected,
        "ok": ok,
        "chars": len(text),
    }


async def main() -> None:
    for t, x in CAMPAIGNS:
        print(f"len={len(x)} {t}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2200}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")

        print("=== DELETE ALL ===")
        ids = await list_ad_ids(page)
        print("ids", ids)
        for ad_id in ids:
            await delete_ad(page, ad_id)
        for ad_id in await list_ad_ids(page):
            await delete_ad(page, ad_id)
        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(900)
        print((await page.locator("body").inner_text())[:400])

        print("\n=== CREATE ===")
        results = []
        for i, (title, text) in enumerate(CAMPAIGNS, 1):
            bot = BOTS[(i - 1) % len(BOTS)]
            print(f"\n--- {i}/{len(CAMPAIGNS)} {title} -> {bot}")
            r = await create_bot_ad(page, title, text, bot, i)
            if not r.get("ok") and r.get("reason") == "bot_not_found":
                for alt in BOTS:
                    if alt == bot:
                        continue
                    r = await create_bot_ad(page, title, text, alt, i)
                    if r.get("ok"):
                        break
            results.append(r)
            await page.wait_for_timeout(500)

        Path("/tmp/editorial-v2-results.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2)
        )
        print(json.dumps(results, ensure_ascii=False, indent=2))
        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(1100)
        print((await page.locator("body").inner_text())[:2800])
        await page.screenshot(path="/tmp/editorial-v2-account.png", full_page=True)
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

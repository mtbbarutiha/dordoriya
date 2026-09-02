#!/usr/bin/env python3
"""Create 6 additional clean editorial Telegram Ads (do not delete existing)."""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "3VQIGO7L1hpg1h1agS2rHCCKDrfwYsC6nRk3BrB71Jw8IhaTIyjfb6s_6x_4mT7A"
)

BOTS = [
    "melogap",
    "Melochat_bot",
    "NashenasBot",
]

# Distinct from the 12 already In Review — zero emoji, single-line, ≤160 chars
CAMPAIGNS = [
    (
        "گفتگوی ناشناس روزانه",
        "هر روز با افراد جدید گفتگو کن. چت ناشناس و امن در دوردوریا با حفظ هویت. شروع رایگان: @Dordoriya_bot",
    ),
    (
        "هم‌صحبت تازه پیدا کن",
        "هم‌صحبت تازه برای حرف زدن پیدا کن. چت ناشناس، پیام خصوصی و فیلتر شهر در دوردوریا: @Dordoriya_bot",
    ),
    (
        "چت با فیلتر شهر",
        "با فیلتر شهر و سن، افراد نزدیک‌تر را پیدا کن. چت ناشناس رایگان در دوردوریا. ورود: @Dordoriya_bot",
    ),
    (
        "دوست‌یابی ناشناس",
        "دوست‌یابی ناشناس بدون لو رفتن هویت. پیام و ویس خصوصی در دوردوریا. ثبت‌نام رایگان: @Dordoriya_bot",
    ),
    (
        "ورود سریع به گپ",
        "سریع وارد گپ شو و با یک ناشناس حرف بزن. هویت محفوظ و شروع رایگان در دوردوریا: @Dordoriya_bot",
    ),
    (
        "آشنایی بدون هویت",
        "بدون نمایش هویت واقعی آشنا شو. چت ناشناس امن و افراد نزدیک در دوردوریا. شروع: @Dordoriya_bot",
    ),
]

CPM = "0.20"
BUDGET = "3.00"
OUT = Path("/tmp/clean-extra6-ads.json")


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


async def clear_bot_field(page) -> None:
    await page.evaluate(
        """() => {
          const w = document.querySelector('.js-field-bots-wrap');
          if (!w) return;
          w.querySelectorAll(
            '.selected-item .remove, .js-selected-item-remove, a.remove, .selected-items .close'
          ).forEach(el => el.click());
          const el = w.querySelector('.input.form-control');
          if (el) {
            el.innerHTML = '';
            el.dispatchEvent(new InputEvent('input', {bubbles:true}));
          }
        }"""
    )
    await page.wait_for_timeout(250)


async def add_bot_target(page, bot_query: str) -> str | None:
    wrap = page.locator(".js-field-bots-wrap .input.form-control")
    await wrap.scroll_into_view_if_needed()
    await clear_bot_field(page)
    await wrap.click()
    await page.wait_for_timeout(120)
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Backspace")
    await wrap.type(bot_query, delay=30)
    await page.wait_for_timeout(1200)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(900)
    selected = (
        await page.locator(".js-field-bots-wrap .selected-items").inner_text()
    ).strip()
    lines = [ln.strip() for ln in selected.splitlines() if ln.strip()]
    chip = None
    for ln in lines:
        if ln.lower() != bot_query.lower() and not ln.startswith("http"):
            chip = ln
            break
    if not chip and lines and lines[0].lower() != bot_query.lower():
        chip = lines[0]
    print(f"  bot={bot_query!r} chip={chip!r}")
    return chip


async def create_bot_ad(page, title: str, text: str, bot_query: str, idx: int) -> dict:
    assert "\n" not in text and "\r" not in text
    assert len(text) <= 160, f"too long {len(text)}"
    await page.goto(
        "https://ads.telegram.org/account/ad/new", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(900)
    clear = page.get_by_text("Clear Draft", exact=True)
    if await clear.count() and await clear.first.is_visible():
        await clear.first.click()
        await page.wait_for_timeout(500)

    await page.locator("label.pr-radio-tab", has_text="Bots").first.click()
    await page.wait_for_timeout(350)

    await page.locator("input[name=title]").fill(title)
    await page.locator("textarea[name=text]").fill(text)
    await page.locator("input[name=promote_url]").fill("https://t.me/Dordoriya_bot")
    await js_check(page, "input[name=picture]")
    await page.locator("input[name=cpm]").fill(CPM)
    await page.locator("input[name=budget]").fill(BUDGET)
    await js_check(page, 'input[name=views_per_user][value="4"]')
    await js_check(page, 'input[name=active][value="1"]')

    selected = await add_bot_target(page, bot_query)
    if not selected:
        return {
            "title": title,
            "text": text,
            "bot": bot_query,
            "ok": False,
            "reason": "bot_not_found",
        }

    await js_check(page, "input[name=confirmed]")
    await page.screenshot(path=f"/tmp/clean-extra6-before-{idx}.png", full_page=True)
    await page.evaluate(
        """() => {
          const btn = Array.from(document.querySelectorAll('button,a,input[type=submit]'))
            .find(el => /Create Ad/i.test(el.textContent || el.value || ''));
          if (btn) btn.click();
        }"""
    )
    await page.wait_for_timeout(2800)
    body = await page.locator("body").inner_text()
    ok = "Create a new ad" in body or (
        "/account/ad/" in page.url and "/new" not in page.url
    )
    if "Please choose target" in body or "can't contain new lines" in body.lower():
        ok = False
    if "balance is too low" in body.lower():
        ok = False
    m = re.search(r"/account/ad/(\d+)", page.url)
    ad_id = int(m.group(1)) if m and "/new" not in page.url else None
    print(("OK" if ok else "FAIL"), idx, title, "chars", len(text), page.url)
    if not ok:
        print(body[:700])
        await page.screenshot(path=f"/tmp/clean-extra6-fail-{idx}.png", full_page=True)
    return {
        "title": title,
        "text": text,
        "bot": bot_query,
        "selected": selected,
        "chars": len(text),
        "ok": ok,
        "ad_id": ad_id,
        "url": page.url,
        "cpm": CPM,
        "budget": BUDGET,
    }


async def extract_account_summary(page) -> dict:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    body = await page.locator("body").inner_text()
    free = None
    m = re.search(r"Free Grams?\s*[^\d]*([\d.]+)", body, re.I)
    if m:
        free = m.group(1)
    else:
        m2 = re.search(r"([\d.]+)\s*Free", body, re.I)
        if m2:
            free = m2.group(1)
    ads = []
    rows = page.locator("a[href*='/account/ad/']")
    n = await rows.count()
    for i in range(n):
        a = rows.nth(i)
        href = await a.get_attribute("href") or ""
        text = (await a.inner_text()).strip()
        mid = re.search(r"/account/ad/(\d+)", href)
        if mid:
            ads.append({"id": int(mid.group(1)), "href": href, "text": text[:120]})
    return {"free_grams": free, "body_preview": body[:3500], "ads_links": ads}


async def main() -> None:
    for t, x in CAMPAIGNS:
        assert "\n" not in x
        assert len(x) <= 160
        print(f"len={len(x)} title={t}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2400}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)

        before = await extract_account_summary(page)
        print("\n=== BEFORE ===")
        print("free", before.get("free_grams"))
        print(before["body_preview"][:800])

        print("\n=== CREATE 6 EXTRA CLEAN ADS ===")
        results = []
        for i, (title, text) in enumerate(CAMPAIGNS, 1):
            bot = BOTS[(i - 1) % len(BOTS)]
            print(f"\n--- {i}/6 {title} -> {bot} ---")
            created = await create_bot_ad(page, title, text, bot, i)
            if not created.get("ok") and created.get("reason") == "bot_not_found":
                for alt in BOTS:
                    if alt == bot:
                        continue
                    created = await create_bot_ad(page, title, text, alt, i)
                    if created.get("ok"):
                        break
            results.append(created)
            await page.wait_for_timeout(600)

        after = await extract_account_summary(page)
        print("\n=== AFTER ACCOUNT ===")
        print(after["body_preview"][:3200])
        await page.screenshot(path="/tmp/clean-extra6-account.png", full_page=True)

        payload = {
            "campaigns": results,
            "ok_count": sum(1 for r in results if r.get("ok")),
            "before_free_grams": before.get("free_grams"),
            "after_free_grams": after.get("free_grams"),
            "account_preview": after["body_preview"],
            "ads_links": after["ads_links"],
        }
        OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print("\nRESULTS")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

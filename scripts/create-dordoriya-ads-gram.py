#!/usr/bin/env python3
"""Create Dordoriya ads on the new Telegram Ads (Gram) beta form."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "1yQ7Qf4ZBdN6UNKr_se_mbjPAvIVxquj7Z2SmtLCVxw5Q-yZvduUIjnM8EVFA90o"
)

CAMPAIGNS = [
    {
        "title": "دوردوریا · چت ناشناس",
        "text": "حرف بزن بدون لو رفتن هویت 🎭 چت ناشناس یک‌به‌یک در دوردوریا — شروع رایگان",
        "url": "https://t.me/Dordoriya_bot",
        "cpm": "0.20",
        "budget": "5.00",
    },
    {
        "title": "دوردوریا · افراد نزدیک",
        "text": "آدم‌های نزدیکت رو پیدا کن 📍 هم‌محلی‌ها آنلاین‌ان — یه سلام ساده بفرست",
        "url": "https://t.me/Dordoriya_bot",
        "cpm": "0.20",
        "budget": "5.00",
    },
    {
        "title": "دوردوریا · احراز چهره",
        "text": "پروفایل واقعی = اعتماد بیشتر ✅ احراز هوشمند چهره در دوردوریا",
        "url": "https://t.me/Dordoriya_bot",
        "cpm": "0.20",
        "budget": "5.00",
    },
    {
        "title": "دوردوریا · پیام و ویس",
        "text": "پیام دایرکت و ویس خصوصی 💌🎤 گفتگو رو ساده‌تر شروع کن — @Dordoriya_bot",
        "url": "https://t.me/Dordoriya_bot",
        "cpm": "0.20",
        "budget": "5.00",
    },
]


async def js_check(page, selector: str) -> None:
    await page.evaluate(
        """(sel) => {
          const el = document.querySelector(sel);
          if (!el) return;
          el.scrollIntoView({block:'center'});
          el.checked = true;
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
          if (el.labels && el.labels[0]) {
            // no-op; already set checked
          }
        }""",
        selector,
    )


async def create_one(page, camp: dict, idx: int) -> str | None:
    await page.goto(
        "https://ads.telegram.org/account/ad/new", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(1200)

    clear = page.get_by_text("Clear Draft", exact=True)
    if await clear.count() and await clear.first.is_visible():
        await clear.first.click()
        await page.wait_for_timeout(800)

    # Channels targeting (default often already channels)
    await js_check(page, 'input[name=target_type][value=channels]')

    await page.locator("input[name=title]").fill(camp["title"])
    await page.locator("textarea[name=text]").fill(camp["text"])
    await page.locator("input[name=promote_url]").fill(camp["url"])
    await js_check(page, "input[name=picture]")
    await page.locator("input[name=cpm]").fill(camp["cpm"])
    await page.locator("input[name=budget]").fill(camp["budget"])
    await js_check(page, 'input[name=views_per_user][value="4"]')
    await js_check(page, 'input[name=active][value="1"]')

    # Required: target language Persian
    try:
        lang_inp = page.locator(".js-field-langs-wrap .input.form-control")
        await lang_inp.click()
        await page.wait_for_timeout(200)
        await page.keyboard.type("Persian")
        await page.wait_for_timeout(500)
        pers = page.locator(
            ".js-field-langs-wrap .select-list-item", has_text="Persian"
        )
        if await pers.count():
            await pers.first.click()
            await page.wait_for_timeout(400)
            print("lang selected:", await page.locator(".js-field-langs-wrap .selected-items").inner_text())
    except Exception as exc:
        print("lang skip:", exc)

    await js_check(page, "input[name=confirmed]")
    await page.screenshot(path=f"/tmp/ad-before-create-{idx}.png", full_page=True)

    # Click Create Ad via JS to avoid viewport issues
    await page.evaluate(
        """() => {
          const btn = Array.from(document.querySelectorAll('button, a, input[type=submit]'))
            .find(el => /Create Ad/i.test(el.textContent || el.value || ''));
          if (btn) btn.click();
        }"""
    )

    try:
        await page.wait_for_url(
            lambda u: "/account/ad/" in u and "/new" not in u, timeout=25000
        )
        print("OK", idx, page.url)
        return page.url
    except Exception:
        body = await page.locator("body").inner_text()
        print("FAIL", idx, page.url)
        print(body[:2000])
        await page.screenshot(path=f"/tmp/ad-fail-{idx}.png", full_page=True)
        return None


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH),
            viewport={"width": 1440, "height": 2200},
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)

        results = []
        for i, camp in enumerate(CAMPAIGNS, 1):
            print(f"\n=== {i}/{len(CAMPAIGNS)} {camp['title']} ===")
            url = await create_one(page, camp, i)
            results.append({"title": camp["title"], "url": url})
            await page.wait_for_timeout(1500)

        print("\nRESULTS")
        print(json.dumps(results, ensure_ascii=False, indent=2))
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

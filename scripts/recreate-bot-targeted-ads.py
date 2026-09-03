#!/usr/bin/env python3
"""Delete old Dordoriya ads, then create 10 bot-targeted campaigns."""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "1yQ7Qf4ZBdN6UNKr_se_mbjPAvIVxquj7Z2SmtLCVxw5Q-yZvduUIjnM8EVFA90o"
)

# Famous/popular Telegram bots (official + widely used)
FAMOUS_BOTS = [
    "https://t.me/gif",
    "https://t.me/like",
    "https://t.me/vote",
    "https://t.me/stickers",
    "https://t.me/BotFather",
    "https://t.me/SpamBot",
    "https://t.me/PremiumBot",
    "https://t.me/DiscussBot",
    "https://t.me/telegraph",
    "https://t.me/Pic",
]

CAMPAIGN_TEXTS = [
    ("دوردوریا · چت ناشناس", "چت ناشناس بدون لو رفتن هویت 🎭 شروع رایگان در دوردوریا"),
    ("دوردوریا · پارتنر جدید", "پارتنر و دوست جدید پیدا کن 💞 دوردوریا — دیت و دوستیابی"),
    ("دوردوریا · افراد نزدیک", "آدم‌های نزدیکت رو پیدا کن 📍 هم‌محلی‌ها منتظرن"),
    ("دوردوریا · پیام دایرکت", "پیام دایرکت و ویس خصوصی بفرست 💌🎤 دوردوریا"),
    ("دوردوریا · هم‌استانی", "هم‌استانی‌هات رو پیدا کن 🏘 زبان مشترک، آشنایی نزدیک‌تر"),
    ("دوردوریا · احراز چهره", "پروفایل واقعی با احراز چهره ✅ اعتماد بیشتر در دوردوریا"),
    ("دوردوریا · چت سریع", "وصل شو به یه ناشناس جدید ⚡ چت سریع در دوردوریا"),
    ("دوردوریا · سکه رایگان", "ثبت‌نام کن و سکه هدیه بگیر 🎁 دوردوریا"),
    ("دوردوریا · پروفایل", "پروفایلت رو بساز و بیشتر دیده شو ✨ دوردوریا"),
    ("دوردوریا · شروع کن", "همین الان وارد دوردوریا شو 🚀 چت، آشنایی، دوستیابی"),
]

CPM = "0.20"
BUDGET = "3.00"  # 10 * 3 = 30 Gram


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


async def list_ad_ids(page) -> list[int]:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
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
    await page.wait_for_timeout(800)
    btn = page.locator("a.delete-ad-btn, a.pr-link-btn.delete-ad-btn")
    if await btn.count() == 0:
        btn = page.get_by_text("Delete Ad", exact=True)
    if await btn.count() == 0:
        print(f"  no delete button for {ad_id}")
        return False
    await btn.first.click()
    await page.wait_for_timeout(600)
    # Modal confirm Delete
    confirm = page.locator(".modal button, .popup button, button").filter(
        has_text=re.compile(r"^Delete$")
    )
    if await confirm.count() == 0:
        # fallback: any visible Delete button that is not the top link
        confirm = page.get_by_role("button", name="Delete")
    if await confirm.count() == 0:
        # JS fallback
        clicked = await page.evaluate(
            """() => {
              const btns = Array.from(document.querySelectorAll('button, a.btn, .btn'));
              const b = btns.find(el => (el.textContent || '').trim() === 'Delete');
              if (b) { b.click(); return true; }
              return false;
            }"""
        )
        print(f"  js confirm={clicked}")
    else:
        await confirm.first.click()
    await page.wait_for_timeout(1500)
    print(f"  deleted? url={page.url}")
    return True


async def add_bot_target(page, bot_url: str) -> None:
    wrap = page.locator(".js-field-bots-wrap .input.form-control")
    await wrap.click()
    await page.wait_for_timeout(200)
    await page.keyboard.type(bot_url)
    await page.wait_for_timeout(900)
    # select suggestion if any
    item = page.locator(".js-field-bots-wrap .select-list-item, .js-field-bots-wrap .search-item").first
    if await item.count():
        await item.click()
    else:
        await page.keyboard.press("Enter")
    await page.wait_for_timeout(500)
    selected = await page.locator(".js-field-bots-wrap .selected-items").inner_text()
    print("  bots selected:", repr(selected[:120]))


async def create_bot_ad(page, title: str, text: str, bot_url: str, idx: int) -> str | None:
    await page.goto(
        "https://ads.telegram.org/account/ad/new", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(1000)
    clear = page.get_by_text("Clear Draft", exact=True)
    if await clear.count() and await clear.first.is_visible():
        await clear.first.click()
        await page.wait_for_timeout(700)

    # Target Bots (not Channels)
    await page.locator("label", has_text="Bots").first.click()
    await page.wait_for_timeout(500)

    await page.locator("input[name=title]").fill(title)
    await page.locator("textarea[name=text]").fill(text)
    await page.locator("input[name=promote_url]").fill("https://t.me/Dordoriya_bot")
    await js_check(page, "input[name=picture]")
    await page.locator("input[name=cpm]").fill(CPM)
    await page.locator("input[name=budget]").fill(BUDGET)
    await js_check(page, 'input[name=views_per_user][value="4"]')
    await js_check(page, 'input[name=active][value="1"]')

    await add_bot_target(page, bot_url)
    await js_check(page, "input[name=confirmed]")
    await page.screenshot(path=f"/tmp/bot-ad-before-{idx}.png", full_page=True)

    await page.evaluate(
        """() => {
          const btn = Array.from(document.querySelectorAll('button, a, input[type=submit]'))
            .find(el => /Create Ad/i.test(el.textContent || el.value || ''));
          if (btn) btn.click();
        }"""
    )
    await page.wait_for_timeout(2500)
    url = page.url
    body = await page.locator("body").inner_text()
    if "/account/ad/" in url and "/new" not in url:
        print("OK", idx, url)
        return url
    if "Create a new ad" in body and title.split("·")[0].strip() in body:
        # landed on account list after create
        print("OK(list)", idx, url)
        return url
    print("FAIL", idx, url)
    print(body[:1200])
    await page.screenshot(path=f"/tmp/bot-ad-fail-{idx}.png", full_page=True)
    return None


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2400}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(800)

        print("=== DELETE OLD ADS ===")
        old_ids = await list_ad_ids(page)
        print("found ads:", old_ids)
        for ad_id in old_ids:
            await delete_ad(page, ad_id)
        remaining = await list_ad_ids(page)
        print("remaining after delete:", remaining)
        print((await page.locator("body").inner_text())[:600])

        print("\n=== CREATE 10 BOT-TARGETED ADS ===")
        results = []
        for i, ((title, text), bot) in enumerate(zip(CAMPAIGN_TEXTS, FAMOUS_BOTS), 1):
            print(f"\n--- {i}/10 {title} -> {bot} ---")
            url = await create_bot_ad(page, title, text, bot, i)
            results.append({"title": title, "bot": bot, "url": url})
            await page.wait_for_timeout(1200)

        print("\nRESULTS")
        print(json.dumps(results, ensure_ascii=False, indent=2))
        final_ids = await list_ad_ids(page)
        print("final ad ids:", final_ids)
        print((await page.locator("body").inner_text())[:2000])
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

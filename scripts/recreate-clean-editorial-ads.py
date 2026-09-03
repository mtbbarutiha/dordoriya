#!/usr/bin/env python3
"""Delete declined ads and recreate with Telegram Ads editorial-compliant copy.

Avoid: excessive emoji, gimmicky symbols, line breaks, vague spammy text.
Keep: clear Persian, 0–1 emoji in title, ≤2 in body, same Persian bot targets.
"""
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

# Verified FA anon-chat bots
BOTS = [
    "melogap",
    "Melochat_bot",
    "NashenasBot",
]

# Clean editorial copy: short title, clear body, max ~2 emoji total, no newlines
CAMPAIGNS = [
    (
        "چت ناشناس رایگان",
        "چت ناشناس و امن در دوردوریا. هویتت محفوظ می‌ماند. دوست و هم‌صحبت جدید پیدا کن. شروع رایگان: @Dordoriya_bot",
    ),
    (
        "دوست جدید پیدا کن",
        "در دوردوریا با افراد نزدیک آشنا شو. چت ناشناس، پیام و ویس خصوصی. ثبت‌نام رایگان در @Dordoriya_bot",
    ),
    (
        "گپ ناشناس امن",
        "بدون لو رفتن هویت حرف بزن. چت ناشناس رایگان با فیلتر شهر و سن. وارد دوردوریا شو: @Dordoriya_bot",
    ),
    (
        "افراد نزدیک آنلاین",
        "هم‌محلی و هم‌استانی‌هایت را پیدا کن. چت ناشناس و آشنایی راحت در دوردوریا. شروع از @Dordoriya_bot",
    ),
    (
        "پیام و ویس خصوصی",
        "پیام دایرکت و ویس خصوصی بفرست. چت ناشناس بدون استرس در دوردوریا. همین الان شروع کن: @Dordoriya_bot",
    ),
    (
        "هم‌استانی پیدا کن",
        "با هم‌استانی‌ها آشنا شو. زبان مشترک، چت ناشناس و فیلتر شهر. دوردوریا را باز کن: @Dordoriya_bot",
    ),
    (
        "وصل شو به ناشناس",
        "چت سریع با یک ناشناس جدید. هویت مخفی و شروع رایگان در دوردوریا. ورود: @Dordoriya_bot",
    ),
    (
        "سکه هدیه ورود",
        "ثبت‌نام کن و سکه هدیه بگیر. چت ناشناس، دوست‌یابی و افراد نزدیک در دوردوریا: @Dordoriya_bot",
    ),
    (
        "پروفایل بساز",
        "پروفایلت را بساز تا بیشتر دیده شوی. چت ناشناس و دوستیابی در دوردوریا. شروع رایگان: @Dordoriya_bot",
    ),
    (
        "شروع در دوردوریا",
        "دوردوریا برای چت ناشناس و آشنایی واقعی. هویت محفوظ، افراد نزدیک، پیام و ویس. @Dordoriya_bot",
    ),
    (
        "امشب تنها نباش",
        "امشب با یک هم‌صحبت جدید گپ بزن. چت ناشناس رایگان در دوردوریا. شروع کن: @Dordoriya_bot",
    ),
    (
        "آشنایی نزدیک‌تر",
        "هم‌شهری و افراد اطرافت را پیدا کن. چت ناشناس امن در دوردوریا. ورود رایگان: @Dordoriya_bot",
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
    await page.wait_for_timeout(600)
    btn = page.locator("a.delete-ad-btn")
    if await btn.count() == 0:
        print(f"  skip {ad_id}: no delete")
        return False
    await btn.first.click()
    await page.wait_for_timeout(500)
    confirm = page.locator(
        ".pr-layer-delete-ad .popup-primary-btn, .alert-popup-container .popup-primary-btn"
    )
    if await confirm.count() == 0:
        confirm = page.locator("div.popup-button.popup-primary-btn")
    if await confirm.count() == 0:
        print(f"  skip {ad_id}: no confirm")
        return False
    await confirm.first.click()
    await page.wait_for_timeout(1400)
    print(f"  deleted {ad_id} -> {page.url}")
    return True


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
        return {"title": title, "bot": bot_query, "ok": False, "reason": "bot_not_found"}

    await js_check(page, "input[name=confirmed]")
    await page.screenshot(path=f"/tmp/clean-ad-before-{idx}.png", full_page=True)
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
    print(("OK" if ok else "FAIL"), idx, title, "chars", len(text), page.url)
    if not ok:
        print(body[:700])
        await page.screenshot(path=f"/tmp/clean-ad-fail-{idx}.png", full_page=True)
    return {
        "title": title,
        "bot": bot_query,
        "selected": selected,
        "chars": len(text),
        "ok": ok,
        "url": page.url,
    }


async def main() -> None:
    for t, x in CAMPAIGNS:
        print(f"len={len(x)} title={t}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2400}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")

        print("=== DELETE ALL ===")
        ids = await list_ad_ids(page)
        print("ids", ids)
        for ad_id in ids:
            await delete_ad(page, ad_id)
        ids2 = await list_ad_ids(page)
        for ad_id in ids2:
            await delete_ad(page, ad_id)
        print("remaining", await list_ad_ids(page))
        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)
        print((await page.locator("body").inner_text())[:500])

        print("\n=== CREATE CLEAN ADS ===")
        results = []
        for i, (title, text) in enumerate(CAMPAIGNS, 1):
            bot = BOTS[(i - 1) % len(BOTS)]
            print(f"\n--- {i}/{len(CAMPAIGNS)} {title} -> {bot} ---")
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

        print("\nRESULTS")
        print(json.dumps(results, ensure_ascii=False, indent=2))
        Path("/tmp/clean-editorial-ads.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2)
        )
        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(1200)
        print("\nACCOUNT")
        print((await page.locator("body").inner_text())[:3200])
        await page.screenshot(path="/tmp/clean-editorial-account.png", full_page=True)
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

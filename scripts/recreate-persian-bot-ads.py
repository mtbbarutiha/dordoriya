#!/usr/bin/env python3
"""Delete declined ads and recreate 10 campaigns targeting verified Persian bots.

Language mismatch (4.7) happens when FA ads target EN bots (gif/like/vote...).
Only bots that Ads searchBot resolves with Persian names are used.
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

# Best-fit FA anon-chat bots (verified via Ads searchBot)
# melogap / Melochat_bot / NashenasBot — language-matched for FA creatives
PERSIAN_BOTS = [
    "melogap",
    "Melochat_bot",
    "NashenasBot",
    # other FA inventory (fallback)
    "melobot",
    "filmgirbot",
    "GratomicAiBOT",
    "PersianGPTBot",
    "alanchand_customer_bot",
    "EitaaBot",
]

CAMPAIGNS = [
    (
        "🔥💬 چت ناشناس رایگان",
        "🎭 چت ناشناس رایگان بدون لو رفتن هویت 💕 دوست و پارتنر جدید پیدا کن 📍 نزدیکات آنلاینن ✨ همین الان وارد دوردوریا شو 🚀 @Dordoriya_bot",
    ),
    (
        "💕🌙 دوست پیدا کن امشب",
        "🌙 امشب تنها نباش 💕 دوست و هم‌صحبت جدید پیدا کن 🎭 چت ناشناس رایگان 💌 دایرکت و ویس 📍 افراد نزدیک 🔥 شروع کن تو دوردوریا ✨",
    ),
    (
        "🎭✨ گپ ناشناس بدون لو رفتن",
        "🎭 هویتت لو نمیره فقط حرف بزن 💬 چت ناشناس رایگان 💕 آشنایی راحت و امن 📍 هم‌محلی‌ها 🎁 سکه هدیه شروع 🚀 دوردوریا منتظرته ✨",
    ),
    (
        "📍💞 افراد نزدیک منتظرتن",
        "📍 آدم‌های اطرافت رو پیدا کن 💞 هم‌محلی و هم‌استانی 💬 چت ناشناس رایگان 💕 دوست جدید بساز ✨ دوردوریا — دیت و دوستیابی 🚀 شروع رایگان",
    ),
    (
        "💌🎤 پیام و ویس خصوصی",
        "💌 پیام دایرکت بفرست 🎤 ویس خصوصی بده 💬 چت ناشناس رایگان 💕 دوست پیدا کن 🎭 بدون استرس حرف بزن ✨ همین الان دوردوریا رو باز کن 🔥",
    ),
    (
        "🏘❤️ هم‌استانی پیدا کن",
        "🏘 هم‌استانی‌هات اینجان ❤️ زبان مشترک حال مشترک 💬 چت ناشناس رایگان 💕 آشنایی نزدیک‌تر 📍 فیلتر شهر و سن ✨ وارد دوردوریا شو 🚀",
    ),
    (
        "⚡🙈 وصل شو به ناشناس",
        "⚡ چت سریع با یه ناشناس جدید 🙈 هویت مخفی 💬 گپ رایگان 💕 شاید دوست یا پارتنرت همین‌جا باشه 🔥 دوردوریا — شروع کن حالا ✨🚀",
    ),
    (
        "🎁💎 سکه هدیه + چت رایگان",
        "🎁 ثبت‌نام کن سکه هدیه بگیر 💎 چت ناشناس رایگان 💕 دوست پیدا کن 📍 افراد نزدیک 💌 دایرکت و ویس ✨ دوردوریا منتظرته 🚀 همین الان بزن",
    ),
    (
        "✨👤 پروفایل بساز دیده شو",
        "✨ پروفایلت رو بساز و بیشتر دیده شو 👤 چت ناشناس رایگان 💕 دوست و پارتنر پیدا کن 📍 نزدیکات 🔥 دوردوریا — دیت و دوستیابی 🚀 شروع رایگان",
    ),
    (
        "🚀💕 همین الان شروع کن",
        "🚀 دوردوریا رو باز کن 💕 چت ناشناس رایگان 🎭 بدون لو رفتن هویت 📍 دوست نزدیک پیدا کن 💌 پیام و ویس 🎁 هدیه ورود 🔥 آشنایی واقعی شروع شد ✨",
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
    await page.wait_for_timeout(700)
    btn = page.locator("a.delete-ad-btn")
    if await btn.count() == 0:
        btn = page.get_by_text("Delete Ad", exact=True)
    if await btn.count() == 0:
        print(f"  skip {ad_id}: no delete")
        return False
    await btn.first.click()
    await page.wait_for_timeout(700)
    # Confirm is a div.popup-primary-btn (not <button>/<a>)
    confirm = page.locator(
        ".pr-layer-delete-ad .popup-primary-btn, .alert-popup-container .popup-primary-btn"
    )
    if await confirm.count() == 0:
        confirm = page.locator("div.popup-button.popup-primary-btn")
    clicked = False
    if await confirm.count():
        await confirm.first.click()
        clicked = True
    await page.wait_for_timeout(1500)
    print(f"  delete {ad_id} confirm={clicked} url={page.url}")
    return clicked


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
    await page.wait_for_timeout(300)


async def add_bot_target(page, bot_query: str) -> str | None:
    """Ads autocomplete is hidden; type username and press Enter after searchBot."""
    wrap = page.locator(".js-field-bots-wrap .input.form-control")
    await wrap.scroll_into_view_if_needed()
    await clear_bot_field(page)
    await wrap.click()
    await page.wait_for_timeout(150)
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Backspace")
    await wrap.type(bot_query, delay=35)
    await page.wait_for_timeout(1400)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(1000)

    selected = (
        await page.locator(".js-field-bots-wrap .selected-items").inner_text()
    ).strip()
    # Strip leftover typed text if chip wasn't created
    lines = [ln.strip() for ln in selected.splitlines() if ln.strip()]
    # Prefer chip name (not the raw typed query)
    chip = None
    for ln in lines:
        if ln.lower() != bot_query.lower() and not ln.startswith("http"):
            chip = ln
            break
    if not chip and lines:
        # Sometimes only chip text remains
        chip = lines[0] if lines[0].lower() != bot_query.lower() else None
    print(f"  bot target raw={selected!r} chip={chip!r}")
    if not chip:
        return None
    # Reject if still looks like unsubmitted typing only
    if chip.lower() in {bot_query.lower(), f"https://t.me/{bot_query}".lower()}:
        return None
    return chip


async def create_bot_ad(page, title: str, text: str, bot_query: str, idx: int) -> dict:
    assert len(text) <= 160, f"text too long {len(text)}: {text}"
    await page.goto(
        "https://ads.telegram.org/account/ad/new", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(900)
    clear = page.get_by_text("Clear Draft", exact=True)
    if await clear.count() and await clear.first.is_visible():
        await clear.first.click()
        await page.wait_for_timeout(600)

    await page.locator("label.pr-radio-tab", has_text="Bots").first.click()
    await page.wait_for_timeout(400)

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
        await page.screenshot(path=f"/tmp/fa-bot-miss-{idx}.png", full_page=True)
        return {"title": title, "bot": bot_query, "ok": False, "reason": "bot_not_found"}

    await js_check(page, "input[name=confirmed]")
    await page.screenshot(path=f"/tmp/fa-bot-before-{idx}.png", full_page=True)
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
    if "Username not found" in body or "1000+ daily" in body:
        ok = False
    print(("OK" if ok else "FAIL"), idx, page.url, "chars", len(text), "bot", selected)
    if not ok:
        print(body[:900])
        await page.screenshot(path=f"/tmp/fa-bot-fail-{idx}.png", full_page=True)
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

        print("=== DELETE ALL EXISTING ADS ===")
        ids = await list_ad_ids(page)
        print("ids", ids)
        for ad_id in ids:
            await delete_ad(page, ad_id)
        ids2 = await list_ad_ids(page)
        print("remaining", ids2)
        for ad_id in ids2:
            await delete_ad(page, ad_id)
        ids3 = await list_ad_ids(page)
        print("final remaining before create", ids3)
        print((await page.locator("body").inner_text())[:700])

        print("\n=== CREATE 10 PERSIAN-BOT ADS ===")
        results = []
        # Rotate primary Persian bots (first 6) across 10 campaigns
        primary = PERSIAN_BOTS[:6]
        for i, (title, text) in enumerate(CAMPAIGNS, 1):
            bot = primary[(i - 1) % len(primary)]
            print(f"\n--- {i}/10 {title} bot={bot} ---")
            created = await create_bot_ad(page, title, text, bot, i)
            if not created.get("ok") and created.get("reason") == "bot_not_found":
                # try remaining bots
                for alt in PERSIAN_BOTS:
                    if alt == bot:
                        continue
                    print(f"  retry with {alt}")
                    created = await create_bot_ad(page, title, text, alt, i)
                    if created.get("ok"):
                        break
            results.append(created)
            await page.wait_for_timeout(800)

        print("\nRESULTS")
        print(json.dumps(results, ensure_ascii=False, indent=2))
        Path("/tmp/fa-persian-bot-ads-results.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2)
        )
        print("\nACCOUNT")
        await page.goto(
            "https://ads.telegram.org/account", wait_until="domcontentloaded"
        )
        await page.wait_for_timeout(1200)
        print((await page.locator("body").inner_text())[:3000])
        await page.screenshot(path="/tmp/fa-persian-bot-ads-account.png", full_page=True)
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

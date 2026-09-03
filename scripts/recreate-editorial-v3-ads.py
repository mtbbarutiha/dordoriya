#!/usr/bin/env python3
"""Recreate ads with fresh editorial-v3 creatives for a new moderation review.

Uses Mohammad Personal (funded). Copy is formal Persian, emoji-free, single-line,
and deliberately different from editorial-v2 wording so moderators see new content.
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
# Mohammad — Personal Account (funded; org has 0)
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "3VQIGO7L1hpg1h1agS2rHCCKDrfwYsC6nRk3BrB71Jw8IhaTIyjfb6s_6x_4mT7A"
)

BOTS = ["melogap", "Melochat_bot", "NashenasBot"]

# 18 fresh formal creatives (new titles + texts vs editorial-v2)
CAMPAIGNS = [
    (
        "معرفی ربات دوردوریا",
        "دوردوریا رباتی برای گفت‌وگوی اجتماعی در تلگرام است. پس از ثبت‌نام می‌توانید پیام خصوصی ارسال کنید.",
    ),
    (
        "ارتباط متنی امن",
        "اگر به دنبال ارتباط متنی امن و منظم هستید، ربات دوردوریا را باز کنید و گفتگو را آغاز نمایید.",
    ),
    (
        "پیدا کردن افراد نزدیک",
        "با دوردوریا افراد نزدیک به محل زندگی خود را پیدا کنید و گفتگوی خصوصی یک‌به‌یک داشته باشید.",
    ),
    (
        "گفت‌وگو بر اساس استان",
        "در دوردوریا می‌توانید بر اساس استان گفتگو کنید تا ارتباط با کاربران هم‌منطقه آسان‌تر شود.",
    ),
    (
        "پیام صوتی در گفتگو",
        "دوردوریا افزون بر پیام متنی، امکان ارسال پیام صوتی خصوصی را نیز فراهم می‌کند. استفاده رایگان است.",
    ),
    (
        "ثبت‌نام آسان و رایگان",
        "ثبت‌نام در ربات دوردوریا ساده و رایگان است. پس از ورود، گفتگوی خصوصی را بدون هزینه شروع کنید.",
    ),
    (
        "حریم خصوصی در گفتگو",
        "دوردوریا با تأکید بر حریم خصوصی طراحی شده است تا گفتگوی یک‌به‌یک در فضای کنترل‌شده انجام شود.",
    ),
    (
        "ارتباط اجتماعی در تلگرام",
        "برای ارتباط اجتماعی سریع در تلگرام، دوردوریا را امتحان کنید. پیام‌رسانی خصوصی و فیلتر موقعیت در دسترس است.",
    ),
    (
        "گفتگوی خصوصی یک نفره",
        "گفتگوی خصوصی یک نفره در دوردوریا امکان‌پذیر است. ربات را باز کنید، پروفایل بسازید و شروع کنید.",
    ),
    (
        "پروفایل کاربری ساده",
        "با ساخت پروفایل کاربری ساده در دوردوریا، دیگران شما را راحت‌تر پیدا می‌کنند و گفتگو شکل می‌گیرد.",
    ),
    (
        "جستجو با فیلتر سن",
        "دوردوریا امکان جستجو با فیلتر سن و استان را دارد تا گفتگو با افراد مناسب‌تر انجام شود.",
    ),
    (
        "شروع سریع گفتگو",
        "ربات دوردوریا را در تلگرام باز کنید و گفتگوی اجتماعی را به‌سرعت و بدون هزینه اولیه آغاز کنید.",
    ),
    (
        "ربات پیام‌رسان اجتماعی",
        "دوردوریا یک ربات پیام‌رسان اجتماعی است برای گفتگو، پیام متنی، پیام صوتی و ارتباط محلی.",
    ),
    (
        "کاربران محلی و همسایه",
        "در دوردوریا با کاربران محلی و هم‌استان آشنا شوید و پیام خصوصی رد و بدل کنید. ثبت‌نام رایگان است.",
    ),
    (
        "فضای گفتگوی محترمانه",
        "دوردوریا فضای گفتگوی اجتماعی محترمانه فراهم می‌کند. مناسب کسانی که ارتباط ساده و امن می‌خواهند.",
    ),
    (
        "ارتباط بدون هزینه اولیه",
        "شروع کار با دوردوریا بدون هزینه اولیه است. گفتگوی خصوصی و فیلتر موقعیت در یک ربات تلگرامی.",
    ),
    (
        "دوردوریا برای گفتگو",
        "دوردوریا برای گفتگوی اجتماعی و پیام خصوصی ساخته شده است. مناسب ارتباط منظم بین کاربران تلگرام.",
    ),
    (
        "باز کردن ربات دوردوریا",
        "برای باز کردن ربات دوردوریا و آغاز گفتگوی خصوصی با کاربران نزدیک، لینک تبلیغ را در تلگرام دنبال کنید.",
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

        print("=== DELETE ALL (if any) ===")
        ids = await list_ad_ids(page)
        print("ids", ids)
        for ad_id in ids:
            await delete_ad(page, ad_id)
        for ad_id in await list_ad_ids(page):
            await delete_ad(page, ad_id)
        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(900)
        print((await page.locator("body").inner_text())[:400])

        print("\n=== CREATE editorial-v3 ===")
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

        Path("/tmp/editorial-v3-results.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2)
        )
        print(json.dumps(results, ensure_ascii=False, indent=2))
        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(1100)
        overview = await page.locator("body").inner_text()
        Path("/tmp/editorial-v3-account.txt").write_text(overview)
        print(overview[:2800])
        await page.screenshot(path="/tmp/editorial-v3-account.png", full_page=True)
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

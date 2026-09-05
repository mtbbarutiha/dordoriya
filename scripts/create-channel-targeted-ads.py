#!/usr/bin/env python3
"""Create a few Channels-targeted ads (Persian language) to A/B vs bot ads.

Uses free balance only (no mass delete). Safe copy: no dating/free/nearby claims.
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "3VQIGO7L1hpg1h1agS2rHCCKDrfwYsC6nRk3BrB71Jw8IhaTIyjfb6s_6x_4mT7A"
)
PROMOTE = "https://t.me/Dordoriya_bot"
CPM = "0.20"
BUDGET = "3.00"

# Channel-targeted safe creatives (Persian audience)
CAMPAIGNS = [
    (
        "ربات چت دوردوریا",
        "دوردوریا یک ربات چت در تلگرام است. ربات را باز کنید و Start را بزنید.",
    ),
    (
        "شروع کار با دوردوریا",
        "برای شروع کار با دوردوریا، ربات را باز کنید و پیام‌های داخل ربات را دنبال کنید.",
    ),
    (
        "منوی ربات دوردوریا",
        "پس از باز کردن دوردوریا و زدن Start، منوی ربات برای ادامه کار نمایش داده می‌شود.",
    ),
]


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


async def select_persian_lang(page) -> str:
    wrap = page.locator(".js-field-langs-wrap .input.form-control")
    if await wrap.count() == 0:
        # try alternate
        wrap = page.locator(".js-field-languages-wrap .input.form-control")
    if await wrap.count() == 0:
        return "lang_field_missing"
    await wrap.first.scroll_into_view_if_needed()
    await wrap.first.click()
    await page.wait_for_timeout(200)
    await page.keyboard.type("Persian", delay=30)
    await page.wait_for_timeout(700)
    item = page.locator(
        ".js-field-langs-wrap .dropdown-item, .js-field-langs-wrap .select-item, "
        ".js-field-languages-wrap .dropdown-item, .js-field-languages-wrap .select-item"
    ).filter(has_text=re.compile(r"Persian", re.I))
    if await item.count():
        await item.first.click()
        await page.wait_for_timeout(400)
    else:
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(400)
    selected = ""
    for sel in (
        ".js-field-langs-wrap .selected-items",
        ".js-field-languages-wrap .selected-items",
    ):
        loc = page.locator(sel)
        if await loc.count():
            selected = (await loc.inner_text()).strip()
            break
    return selected or "unknown"


async def create_channel_ad(page, title: str, text: str, idx: int) -> dict:
    assert "\n" not in text and len(text) <= 160
    await page.goto(
        "https://ads.telegram.org/account/ad/new", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(800)
    clear = page.get_by_text("Clear Draft", exact=True)
    if await clear.count() and await clear.first.is_visible():
        await clear.first.click()
        await page.wait_for_timeout(400)

    # Prefer Channels tab / radio
    channels_tab = page.locator("label.pr-radio-tab", has_text="Channels")
    if await channels_tab.count():
        await channels_tab.first.click()
    else:
        await js_check(page, 'input[name=target_type][value=channels]')
    await page.wait_for_timeout(300)

    await page.locator("input[name=title]").fill(title)
    await page.locator("textarea[name=text]").fill(text)
    await page.locator("input[name=promote_url]").fill(PROMOTE)
    await js_check(page, "input[name=picture]")
    await page.locator("input[name=cpm]").fill(CPM)
    await page.locator("input[name=budget]").fill(BUDGET)
    await js_check(page, 'input[name=views_per_user][value="4"]')
    await js_check(page, 'input[name=active][value="1"]')

    lang = await select_persian_lang(page)

    await js_check(page, "input[name=confirmed]")
    await page.screenshot(path=f"/tmp/channel-ad-before-{idx}.png", full_page=True)
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
    if "balance is too low" in body.lower() or "Please choose" in body:
        ok = False
    print(("OK" if ok else "FAIL"), idx, title, "lang=", lang.replace("\n", " ")[:80])
    await page.screenshot(path=f"/tmp/channel-ad-after-{idx}.png", full_page=True)
    return {"title": title, "text": text, "ok": ok, "lang": lang, "url": page.url}


async def parse_overview(page) -> dict:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    text = await page.locator("body").inner_text()
    Path("/tmp/ads-after-channel-create.txt").write_text(text)
    bal = None
    m = re.search(r"💎\s*([\d.]+)", text)
    if m:
        bal = m.group(1)
    ads = []
    for m in re.finditer(
        r"(?P<title>[^\n]{2,60})\s+t\.me/\S+\s+\d+\s+\d+\s+💎[\d.]+\s+💎[\d.]+\s+(?P<target>[^\n]+?)\s+(?P<status>In Review|Declined|Active|On Hold|Rejected)\s+",
        text,
    ):
        ads.append(
            {
                "title": m.group("title").strip(),
                "target": m.group("target").strip(),
                "status": m.group("status"),
            }
        )
    return {"balance": bal, "ads": ads, "head": text[:2500]}


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2200}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(900)

        created = []
        for i, (title, text) in enumerate(CAMPAIGNS, 1):
            created.append(await create_channel_ad(page, title, text, i))
            await page.wait_for_timeout(400)

        overview = await parse_overview(page)
        out = {
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "created": created,
            "created_ok": sum(1 for c in created if c.get("ok")),
            "overview": overview,
        }
        Path("/tmp/ads-channel-batch.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2)
        )
        print(json.dumps(out, ensure_ascii=False, indent=2)[:3000])
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

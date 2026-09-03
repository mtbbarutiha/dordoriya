#!/usr/bin/env python3
"""Supersede all Dordoriya ads: delete everything, create 10 emoji-heavy bot ads."""
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
PROMOTE = "https://t.me/Dordoriya_bot"
OUT = Path("/tmp/supersede-dordoriya-result.json")

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

# Titles: lots of emojis + attractive Persian themes
# Texts: single line, ~140-160 chars, no newlines
CAMPAIGNS = [
    (
        "🔥💬 چت ناشناس رایگان",
        "🔥💬 چت ناشناس رایگان با دوردوریا! هویتت لو نمیره، بدون شماره و بدون نگرانی گپ بزن. دوست جدید پیدا کن، حال خوب بگیر و همین الان شروع کن 🚀💕✨ دوردوریا منتظرته!",
    ),
    (
        "💕🌙 دوست پیدا کن امشب",
        "💕🌙 امشب دوست جدید پیدا کن! دوردوریا چت ناشناس و دوستیابی رایگان. با آدمای واقعی حرف بزن، ویس بفرست و ارتباط بساز بدون لو رفتن هویتت 🎭💬❤️ همین الان وارد شو!",
    ),
    (
        "🎭✨ گپ ناشناس بدون لو رفتن",
        "🎭✨ گپ ناشناس بدون لو رفتن هویت! دوردوریا جاییه برای چت رایگان، پیدا کردن دوست و آشنایی امن. شماره نمیخواد، نگرانی نمیخواد — فقط شروع کن و لذت ببر 🔥💬🚀💕",
    ),
    (
        "💘🚀 دیت و دوستیابی آنلاین",
        "💘🚀 دنبال پارتنر یا دوست صمیمی هستی؟ دوردوریا دیت و دوستیابی آنلاین با چت ناشناس رایگان. وصل شو، حرف بزن، حال کن و آدم مناسبتو پیدا کن 💕🌙✨ همین الان شروع کن!",
    ),
    (
        "🌙💫 چت شبونه با ناشناس",
        "🌙💫 شب شده و دلت میخواد حرف بزنی؟ چت شبونه ناشناس در دوردوریا! رایگان، سریع، بدون لو رفتن. دوست پیدا کن، گپ بزن و شب قشنگ‌تری بساز 🔥💬❤️🎭 وارد دوردوریا شو!",
    ),
    (
        "💞🎯 آشنای جدید همین الان",
        "💞🎯 آشنای جدید همین الان! دوردوریا کمکت میکنه دوست، همصحبت یا پارتنر پیدا کنی. چت ناشناس رایگان، امن و جذاب — هویتت محفوظه، تجربه‌ت عالیه ✨💬🚀💕 شروع کن!",
    ),
    (
        "🔥❤️ چت داغ بدون شماره",
        "🔥❤️ چت داغ بدون شماره و بدون لو رفتن! دوردوریا چت ناشناس رایگان برای پیدا کردن دوست و گپ خودمونی. وصل شو، حرف بزن، حال بگیر و امشب رو متفاوت کن 🌙💫💬✨",
    ),
    (
        "✨🤝 دوست واقعی پیدا کن",
        "✨🤝 دنبال دوست واقعی هستی؟ دوردوریا جاییه برای چت ناشناس، دوستیابی و آشنایی امن. رایگان شروع کن، هویتت لو نمیره، آدم‌های جدید منتظرن 🔥💕💬🚀 وارد شو الان!",
    ),
    (
        "💬🌟 گپ بزن حال کن رایگان",
        "💬🌟 گپ بزن، حال کن، رایگان! دوردوریا چت ناشناس و پیدا کردن دوست بدون نگرانی. پیام بده، ویس بفرست، با ناشناس‌های جذاب حرف بزن و دوستی بساز 💘🔥✨🌙 همین الان!",
    ),
    (
        "🚀💕 دوردوریا چت ناشناس",
        "🚀💕 دوردوریا — چت ناشناس رایگان، دوست پیدا کن، دیت و دوستیابی امن! بدون شماره، بدون لو رفتن هویت. همین الان وارد شو و به دنیای گپ و آشنایی وصل شو 🔥💬🎭✨",
    ),
]

CPM = "0.20"
BUDGET_PREFERRED = "3.00"
BUDGET_FALLBACK = "2.00"


def char_len(s: str) -> int:
    return len(s)


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


async def get_balance(page) -> str:
    text = await page.locator("body").inner_text()
    m = re.search(r"Budget[:\s]*[💎\s]*([\d.]+)", text, re.I)
    if m:
        return m.group(1)
    m2 = re.search(r"💎\s*([\d.]+)", text)
    return m2.group(1) if m2 else "?"


async def list_ad_ids(page) -> list[int]:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    hrefs = await page.locator("a[href*='/account/ad/']").evaluate_all(
        "els => els.map(e => e.getAttribute('href') || '')"
    )
    ids: set[int] = set()
    for h in hrefs:
        m = re.search(r"/account/ad/(\d+)(?:/|$)", h)
        if m:
            ids.add(int(m.group(1)))
    return sorted(ids)


async def list_ads_summary(page) -> dict:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    body = await page.locator("body").inner_text()
    balance = await get_balance(page)
    await page.screenshot(path="/tmp/ads-account-state.png", full_page=True)

    links = page.locator("a[href*='/account/ad/']")
    n = await links.count()
    seen = set()
    ads = []
    for i in range(n):
        href = await links.nth(i).get_attribute("href") or ""
        m = re.search(r"/account/ad/(\d+)(?:/|$)", href)
        if not m:
            continue
        ad_id = int(m.group(1))
        if ad_id in seen:
            continue
        seen.add(ad_id)
        txt = (await links.nth(i).inner_text()).strip()
        ads.append({"id": ad_id, "link_text": txt[:250], "href": href})
    return {
        "balance": balance,
        "ad_ids": sorted(seen),
        "ads": ads,
        "body_preview": body[:3500],
    }


async def delete_ad(page, ad_id: int) -> bool:
    await page.goto(
        f"https://ads.telegram.org/account/ad/{ad_id}", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(1000)
    btn = page.locator("a.delete-ad-btn, a.pr-link-btn.delete-ad-btn")
    if await btn.count() == 0:
        btn = page.get_by_text("Delete Ad", exact=True)
    if await btn.count() == 0:
        print(f"  no delete button for {ad_id}")
        await page.screenshot(path=f"/tmp/ad-delete-miss-{ad_id}.png", full_page=True)
        return False
    await btn.first.click()
    await page.wait_for_timeout(900)
    # Modal confirm is a DIV: .pr-layer-delete-ad .popup-primary-btn (not <button>)
    confirm = page.locator(
        ".pr-layer-delete-ad .popup-primary-btn, "
        ".alert-popup-container .popup-primary-btn, "
        "div.popup-button.popup-primary-btn"
    )
    if await confirm.count() == 0:
        confirm = page.locator(".popup-button, button").filter(
            has_text=re.compile(r"^Delete$")
        )
    if await confirm.count() == 0:
        clicked = await page.evaluate(
            """() => {
              const sels = [
                '.pr-layer-delete-ad .popup-primary-btn',
                '.alert-popup-container .popup-primary-btn',
                'div.popup-button.popup-primary-btn',
                '.popup-button',
                'button',
              ];
              const nodes = [];
              for (const s of sels) nodes.push(...document.querySelectorAll(s));
              const b = nodes.find(el => /Delete/i.test((el.textContent || '').trim()));
              if (b) { b.click(); return (el => el.className||el.tagName)(b); }
              return false;
            }"""
        )
        print(f"  js confirm={clicked}")
        if not clicked:
            await page.screenshot(path=f"/tmp/ad-delete-noconfirm-{ad_id}.png", full_page=True)
            return False
    else:
        await confirm.first.click()
        print(f"  confirm clicked via locator")
    await page.wait_for_timeout(2000)
    # Verify gone from list
    ids_after = await list_ad_ids(page)
    gone = ad_id not in ids_after
    print(f"  deleted={gone} url={page.url} remaining={ids_after}")
    return gone


async def add_bot_target(page, bot_url: str) -> str:
    wrap = page.locator(".js-field-bots-wrap .input.form-control")
    await wrap.click()
    await page.wait_for_timeout(250)
    await page.keyboard.type(bot_url)
    await page.wait_for_timeout(1100)
    item = page.locator(
        ".js-field-bots-wrap .select-list-item, .js-field-bots-wrap .search-item"
    ).first
    if await item.count():
        await item.click()
    else:
        await page.keyboard.press("Enter")
    await page.wait_for_timeout(600)
    selected = ""
    sel = page.locator(".js-field-bots-wrap .selected-items")
    if await sel.count():
        selected = (await sel.first.inner_text()).strip()
    print("  bots selected:", repr(selected[:140]))
    return selected


async def create_bot_ad(
    page, title: str, text: str, bot_url: str, idx: int, budget: str
) -> dict:
    # Validate no newlines and length
    if "\n" in text or "\r" in text:
        raise ValueError(f"text has newlines for ad {idx}")
    tlen = char_len(text)
    print(f"  title={title!r} title_len={char_len(title)} text_len={tlen}")

    await page.goto(
        "https://ads.telegram.org/account/ad/new", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(1200)
    clear = page.get_by_text("Clear Draft", exact=True)
    if await clear.count() and await clear.first.is_visible():
        await clear.first.click()
        await page.wait_for_timeout(800)

    await page.locator("label", has_text="Bots").first.click()
    await page.wait_for_timeout(500)

    await page.locator("input[name=title]").fill(title)
    await page.locator("textarea[name=text]").fill(text)
    await page.locator("input[name=promote_url]").fill(PROMOTE)
    await js_check(page, "input[name=picture]")
    await page.locator("input[name=cpm]").fill(CPM)
    await page.locator("input[name=budget]").fill(budget)
    await js_check(page, 'input[name=views_per_user][value="4"]')
    await js_check(page, 'input[name=active][value="1"]')

    selected = await add_bot_target(page, bot_url)
    await js_check(page, "input[name=confirmed]")
    await page.screenshot(path=f"/tmp/bot-ad-before-{idx}.png", full_page=True)

    await page.evaluate(
        """() => {
          const btn = Array.from(document.querySelectorAll('button, a, input[type=submit]'))
            .find(el => /Create Ad/i.test(el.textContent || el.value || ''));
          if (btn) btn.click();
        }"""
    )
    await page.wait_for_timeout(2800)
    url = page.url
    body = await page.locator("body").inner_text()
    ok = False
    ad_id = None
    if "/account/ad/" in url and "/new" not in url:
        ok = True
        m = re.search(r"/account/ad/(\d+)", url)
        if m:
            ad_id = int(m.group(1))
    elif "Create a new ad" in body or "Your ads" in body or "Ads" in body:
        # may have redirected to list
        if title[:8] in body or "Dordoriya" in body or "دوردوریا" in body or "چت ناشناس" in body:
            ok = True

    result = {
        "idx": idx,
        "title": title,
        "title_len": char_len(title),
        "text": text,
        "text_len": tlen,
        "bot": bot_url,
        "bots_selected": selected,
        "budget": budget,
        "cpm": CPM,
        "url": url,
        "ad_id": ad_id,
        "ok": ok,
    }
    if ok:
        print("OK", idx, url)
    else:
        print("FAIL", idx, url)
        print(body[:1500])
        await page.screenshot(path=f"/tmp/bot-ad-fail-{idx}.png", full_page=True)
    return result


async def inspect_final_ads(page, ad_ids: list[int]) -> list[dict]:
    details = []
    for ad_id in ad_ids:
        await page.goto(
            f"https://ads.telegram.org/account/ad/{ad_id}", wait_until="domcontentloaded"
        )
        await page.wait_for_timeout(900)
        title = ""
        text = ""
        try:
            title = await page.locator("input[name=title]").input_value()
        except Exception:
            pass
        try:
            text = await page.locator("textarea[name=text]").input_value()
        except Exception:
            pass
        body = await page.locator("body").inner_text()
        bots = ""
        bots_sel = page.locator(".js-field-bots-wrap .selected-items")
        if await bots_sel.count():
            bots = (await bots_sel.first.inner_text()).strip()
        status = "unknown"
        try:
            if await page.locator('input[name=active][value="1"]').is_checked():
                status = "active"
            elif await page.locator('input[name=active][value="0"]').is_checked():
                status = "inactive"
        except Exception:
            pass
        # Also look for On hold / Rejected / etc in body
        for label in ("On hold", "Rejected", "In review", "Active", "Stopped", "Paused"):
            if re.search(rf"\b{label}\b", body):
                status = label
                break
        details.append(
            {
                "id": ad_id,
                "title": title,
                "title_len": char_len(title),
                "text": text,
                "text_len": char_len(text),
                "bots": bots[:120],
                "status": status,
            }
        )
        print(f"  ad#{ad_id} status={status} title={title!r} text_len={char_len(text)} bots={bots[:60]!r}")
    return details


async def main() -> None:
    # Preflight char lengths
    print("=== CAMPAIGN CHAR LENGTHS ===")
    for i, (title, text) in enumerate(CAMPAIGNS, 1):
        assert "\n" not in text and "\r" not in text
        print(f"{i}. title_len={char_len(title)} text_len={char_len(text)} | {title}")
        if char_len(text) > 160:
            print(f"   WARNING: text over 160 ({char_len(text)})")
        if char_len(text) < 140:
            print(f"   WARNING: text under 140 ({char_len(text)})")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2400}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)

        print("\n=== INITIAL ACCOUNT STATE ===")
        initial = await list_ads_summary(page)
        print("balance:", initial["balance"])
        print("ad_ids:", initial["ad_ids"])
        for a in initial["ads"]:
            print(" ", a)

        print("\n=== DELETE ALL EXISTING ADS ===")
        # Retry loop until clean
        for attempt in range(5):
            ids = await list_ad_ids(page)
            print(f"attempt {attempt+1}: found {ids}")
            if not ids:
                break
            for ad_id in ids:
                print(f"deleting {ad_id}...")
                try:
                    await delete_ad(page, ad_id)
                except Exception as e:
                    print(f"  delete error {ad_id}: {e}")
                    await page.screenshot(
                        path=f"/tmp/ad-delete-err-{ad_id}.png", full_page=True
                    )
            await page.wait_for_timeout(1500)

        after_delete = await list_ads_summary(page)
        print("after delete balance:", after_delete["balance"])
        print("after delete ad_ids:", after_delete["ad_ids"])

        # Choose budget based on balance
        budget = BUDGET_PREFERRED
        try:
            bal = float(after_delete["balance"])
            if bal < 30.0:
                budget = BUDGET_FALLBACK
                print(f"low balance {bal} -> using budget {budget}")
            else:
                print(f"balance {bal} -> using budget {budget}")
        except Exception:
            print(f"could not parse balance {after_delete['balance']!r}, using {budget}")

        print("\n=== CREATE 10 BOT-TARGETED ADS ===")
        results = []
        for i, ((title, text), bot) in enumerate(zip(CAMPAIGNS, FAMOUS_BOTS), 1):
            print(f"\n--- {i}/10 {title} -> {bot} ---")
            try:
                r = await create_bot_ad(page, title, text, bot, i, budget)
            except Exception as e:
                print(f"create exception: {e}")
                await page.screenshot(path=f"/tmp/bot-ad-exc-{i}.png", full_page=True)
                r = {
                    "idx": i,
                    "title": title,
                    "text": text,
                    "bot": bot,
                    "ok": False,
                    "error": str(e),
                }
            results.append(r)
            await page.wait_for_timeout(1200)

        print("\n=== FINAL STATE ===")
        final = await list_ads_summary(page)
        print("final balance:", final["balance"])
        print("final ad_ids:", final["ad_ids"])
        details = await inspect_final_ads(page, final["ad_ids"])

        report = {
            "initial": {k: initial[k] for k in ("balance", "ad_ids", "ads")},
            "after_delete": {
                k: after_delete[k] for k in ("balance", "ad_ids", "ads")
            },
            "budget_used": budget,
            "create_results": results,
            "final": {
                "balance": final["balance"],
                "ad_ids": final["ad_ids"],
                "ads": final["ads"],
                "details": details,
            },
        }
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("\nWROTE", OUT)
        print(json.dumps(report["final"], ensure_ascii=False, indent=2))

        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

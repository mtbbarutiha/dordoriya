#!/usr/bin/env python3
"""Delete all ads on Mohammad personal; recreate editorial-v2 on @Dordoriya_bot Organization."""
from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"

# Mohammad — Personal Account (old)
OLD_ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "3VQIGO7L1hpg1h1agS2rHCCKDrfwYsC6nRk3BrB71Jw8IhaTIyjfb6s_6x_4mT7A"
)

# @Dordoriya_bot — Organization (target)
NEW_ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "1yQ7Qf4ZBdN6UNKr_se_mbjPAvIVxquj7Z2SmtLCVxw5Q-yZvduUIjnM8EVFA90o"
)
NEW_ACCOUNT_NAME = "@Dordoriya_bot Organization"

BOTS = ["melogap", "Melochat_bot", "NashenasBot"]

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


def log(*a):
    print(*a, flush=True)


async def choose(page, url: str) -> None:
    await page.goto(url, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(1200)


async def list_ad_ids(page) -> list[int]:
    await page.goto(
        "https://ads.telegram.org/account",
        wait_until="domcontentloaded",
        timeout=60000,
    )
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


async def balance(page) -> str:
    text = await page.locator("body").inner_text()
    m = re.search(r"💎\s*([\d.]+)", text)
    return m.group(1) if m else "?"


async def account_label(page) -> str:
    text = await page.locator("body").inner_text()
    # header like "💎0.00Mohammad" or "💎0.00@Dordoriya_bot"
    m = re.search(r"💎\s*[\d.]+\s*([^\n]+)", text)
    return (m.group(1).strip() if m else "?")[:80]


async def delete_ad(page, ad_id: int) -> bool:
    await page.goto(
        f"https://ads.telegram.org/account/ad/{ad_id}",
        wait_until="domcontentloaded",
        timeout=60000,
    )
    await page.wait_for_timeout(600)
    btn = page.locator("a.delete-ad-btn")
    if await btn.count() == 0:
        btn = page.get_by_text("Delete Ad", exact=True)
    if await btn.count() == 0:
        log(f"  no delete btn for {ad_id}")
        return False
    await btn.first.click()
    await page.wait_for_timeout(500)

    clicked = await page.evaluate(
        """() => {
          const all = Array.from(document.querySelectorAll('*'));
          const withQ = all.filter(el => {
            const t = el.innerText || '';
            return t.includes('Do you want to delete this ad') && t.includes('Cancel') && /\\bDelete\\b/.test(t);
          });
          withQ.sort((a,b) => (a.innerText||'').length - (b.innerText||'').length);
          const root = withQ[0] || document.body;
          const clickables = Array.from(root.querySelectorAll('button, a, span, div, input'));
          const exact = clickables.filter(el => {
            const own = Array.from(el.childNodes)
              .filter(n => n.nodeType === 3)
              .map(n => n.textContent.trim())
              .join('');
            const t = own || (el.children.length === 0 ? (el.textContent||'').trim() : '');
            return t === 'Delete';
          });
          const exact2 = clickables.filter(el => (el.textContent||'').trim() === 'Delete');
          const pick = exact[0] || exact2.find(el => el.tagName === 'BUTTON' || el.tagName === 'A') || exact2[0];
          if (!pick) {
            const fb = document.querySelector('.pr-layer-delete-ad .popup-primary-btn, div.popup-button.popup-primary-btn');
            if (fb) { fb.click(); return {ok:true, via:'popup-primary'}; }
            return {ok:false};
          }
          pick.click();
          return {ok:true, tag: pick.tagName};
        }"""
    )
    if not clicked.get("ok"):
        confirm = page.locator(
            ".pr-layer-delete-ad .popup-primary-btn, div.popup-button.popup-primary-btn"
        )
        if await confirm.count():
            await confirm.first.click()
            clicked = {"ok": True, "via": "locator"}
    if not clicked.get("ok"):
        log(f"  confirm failed for {ad_id}")
        return False
    await page.wait_for_timeout(1400)
    log(f"  deleted {ad_id}")
    return True


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
    low = "balance is too low" in body.lower()
    if low or "Please choose target" in body:
        ok = False
    print(("OK" if ok else "FAIL"), idx, title, len(text), selected, "low_balance" if low else "")
    if not ok:
        print(body[:600])
    return {
        "title": title,
        "text": text,
        "bot": bot,
        "selected": selected,
        "ok": ok,
        "low_balance": low,
        "chars": len(text),
        "url": page.url,
    }


async def overview(page) -> str:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1100)
    return await page.locator("body").inner_text()


async def main() -> None:
    summary: dict = {
        "old_account": OLD_ACCOUNT,
        "new_account": NEW_ACCOUNT,
        "new_account_name": NEW_ACCOUNT_NAME,
    }
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2200}
        )
        page = await ctx.new_page()
        page.set_default_timeout(60000)

        # --- DELETE on old (Mohammad) ---
        log("=== SWITCH OLD (Mohammad Personal) ===")
        await choose(page, OLD_ACCOUNT)
        label = await account_label(page)
        before_ids = await list_ad_ids(page)
        before_bal = await balance(page)
        log(f"label={label} balance={before_bal} ids={before_ids}")
        summary["old_before"] = {
            "label": label,
            "balance": before_bal,
            "ids": before_ids,
        }

        deleted = []
        failed = []
        for ad_id in before_ids:
            ok = await delete_ad(page, ad_id)
            (deleted if ok else failed).append(ad_id)

        # second pass for any leftovers
        leftover = await list_ad_ids(page)
        for ad_id in leftover:
            ok = await delete_ad(page, ad_id)
            if ok and ad_id not in deleted:
                deleted.append(ad_id)
            elif not ok and ad_id not in failed:
                failed.append(ad_id)

        after_ids = await list_ad_ids(page)
        after_bal = await balance(page)
        old_body = await overview(page)
        await page.screenshot(path="/tmp/migrate-old-after-delete.png", full_page=True)
        log(f"OLD after delete balance={after_bal} ids={after_ids}")
        summary["old_after"] = {
            "balance": after_bal,
            "ids": after_ids,
            "deleted": deleted,
            "failed": failed,
            "body_head": old_body[:800],
        }

        # --- CREATE on Dordoriya org ---
        log("\n=== SWITCH NEW (@Dordoriya_bot Organization) ===")
        await choose(page, NEW_ACCOUNT)
        new_label = await account_label(page)
        new_bal = await balance(page)
        new_ids_before = await list_ad_ids(page)
        log(f"label={new_label} balance={new_bal} ids={new_ids_before}")
        summary["new_before"] = {
            "label": new_label,
            "balance": new_bal,
            "ids": new_ids_before,
        }

        try:
            bal_f = float(new_bal)
        except ValueError:
            bal_f = 0.0
        needed = len(CAMPAIGNS) * float(BUDGET)
        max_affordable = int(bal_f // float(BUDGET)) if bal_f > 0 else 0
        summary["balance_check"] = {
            "available": new_bal,
            "needed_for_18": needed,
            "max_affordable": max_affordable,
        }
        log(f"balance={new_bal} needed={needed} max_affordable={max_affordable}")

        results = []
        if max_affordable <= 0 and bal_f < float(BUDGET):
            log("INSUFFICIENT BALANCE on Dordoriya org — skipping create")
            summary["created"] = []
            summary["create_skipped"] = "insufficient_balance"
        else:
            to_create = CAMPAIGNS[: max(max_affordable, len(CAMPAIGNS))]
            # still try all; stop early on low_balance
            for i, (title, text) in enumerate(CAMPAIGNS, 1):
                if max_affordable and i > max_affordable + 1:
                    # one extra attempt then stop
                    break
                bot = BOTS[(i - 1) % len(BOTS)]
                log(f"\n--- {i}/{len(CAMPAIGNS)} {title} -> {bot}")
                r = await create_bot_ad(page, title, text, bot, i)
                if not r.get("ok") and r.get("reason") == "bot_not_found":
                    for alt in BOTS:
                        if alt == bot:
                            continue
                        r = await create_bot_ad(page, title, text, alt, i)
                        if r.get("ok"):
                            break
                results.append(r)
                if r.get("low_balance"):
                    log("stopping: low balance")
                    break
                await page.wait_for_timeout(500)
            summary["created"] = results

        new_ids_after = await list_ad_ids(page)
        new_bal_after = await balance(page)
        new_body = await overview(page)
        await page.screenshot(path="/tmp/migrate-new-account.png", full_page=True)
        summary["new_after"] = {
            "balance": new_bal_after,
            "ids": new_ids_after,
            "body_head": new_body[:2500],
        }

        # verify old still empty
        await choose(page, OLD_ACCOUNT)
        verify_old = await list_ad_ids(page)
        verify_old_bal = await balance(page)
        summary["old_verify"] = {"ids": verify_old, "balance": verify_old_bal}
        log(f"OLD verify ids={verify_old} bal={verify_old_bal}")

        Path("/tmp/migrate-dordoriya-org-result.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2)
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        log("FATAL", type(e).__name__, e)
        import traceback

        traceback.print_exc()
        sys.exit(1)

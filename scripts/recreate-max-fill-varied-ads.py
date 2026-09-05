#!/usr/bin/env python3
"""Delete ALL ads, then fill max balance with varied safe creatives.

Uses full unlocked budget at 💎3.00 each → up to 18 ads when balance is 💎54.
Styles vary (intro / start / menu / link / guide) but stay policy-safe:
no dating, free, secure, nearby, location, voice, income claims.
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
BOTS = ["melogap", "Melochat_bot", "NashenasBot"]
PROMOTE = "https://t.me/Dordoriya_bot"
CPM = "0.20"
BUDGET = "3.00"

CAMPAIGNS = [
    ("ربات چت دوردوریا", "دوردوریا یک ربات چت در تلگرام است. ربات را باز کنید و Start را بزنید."),
    ("شروع کار با دوردوریا", "برای شروع کار با دوردوریا، ربات را باز کنید و پیام‌های داخل ربات را دنبال کنید."),
    ("منوی ربات دوردوریا", "پس از باز کردن دوردوریا و زدن Start، منوی ربات برای ادامه کار نمایش داده می‌شود."),
    ("ورود به دوردوریا", "برای ورود به دوردوریا روی لینک بزنید. مراحل بعدی داخل خود ربات نشان داده می‌شود."),
    ("دوردوریا در تلگرام", "دوردوریا رباتی برای گفتگوی متنی در تلگرام است. جزئیات پس از ورود به ربات دیده می‌شود."),
    ("باز کردن دوردوریا", "ربات دوردوریا را در تلگرام باز کنید، Start بزنید و طبق راهنمای داخل ربات ادامه دهید."),
    ("راهنمای دوردوریا", "راهنمای استفاده از دوردوریا داخل خود ربات است. ابتدا ربات را باز و شروع کنید."),
    ("گفتگو در دوردوریا", "اگر به دنبال ربات گفتگوی متنی هستید، دوردوریا را باز کنید و از منوی آن استفاده کنید."),
    ("مسیر دوردوریا", "این لینک شما را به ربات دوردوریا می‌رساند. ادامه مسیر داخل ربات مشخص می‌شود."),
    ("بات تلگرام دوردوریا", "دوردوریا یک بات تلگرام برای چت است. برای دیدن امکانات فعلی، ربات را باز کنید."),
    ("آشنایی با دوردوریا", "با دوردوریا می‌توانید چت متنی را در تلگرام آغاز کنید. شروع از داخل ربات است."),
    ("ادامه در ربات", "پس از باز کردن لینک دوردوریا، ادامه کار از طریق پیام‌ها و منوی ربات انجام می‌شود."),
    ("گزینه Start دوردوریا", "ربات دوردوریا را باز کنید و گزینه Start را بزنید تا مسیر استفاده نمایش داده شود."),
    ("دوردوریا برای چت", "دوردوریا برای چت متنی در تلگرام طراحی شده است. امکانات پس از Start در دسترس است."),
    ("لینک ربات دوردوریا", "با زدن لینک، وارد ربات دوردوریا می‌شوید. راهنما و گزینه‌ها داخل ربات قرار دارد."),
    ("استفاده از دوردوریا", "برای استفاده از دوردوریا فقط کافی است ربات را باز کنید و دستورهای داخل آن را دنبال کنید."),
    ("معرفی ربات دوردوریا", "دوردوریا ربات چت تلگرامی است. برای آشنایی با سرویس، ربات را باز و شروع کنید."),
    ("شروع گفتگو دوردوریا", "گفتگوی متنی در دوردوریا از داخل ربات آغاز می‌شود. ابتدا Start را بزنید."),
]

STATUS_RE = re.compile(
    r"\b(Declined|Rejected|In Review|On Hold|Active|Completed|Stopped|Pending)\b",
    re.I,
)


def normalize_status(s: str) -> str:
    mapping = {
        "in review": "In Review",
        "on hold": "On Hold",
        "declined": "Declined",
        "rejected": "Declined",
        "active": "Active",
        "completed": "Completed",
        "stopped": "Stopped",
        "pending": "In Review",
    }
    return mapping.get((s or "").strip().lower(), s or "Unknown")


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


async def parse_ads(page) -> list[dict]:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    ads = await page.evaluate(
        """() => {
          const results = [];
          const seen = new Set();
          for (const a of document.querySelectorAll("a[href*='/account/ad/']")) {
            const m = (a.getAttribute('href') || '').match(/\\/account\\/ad\\/(\\d+)/);
            if (!m || seen.has(m[1])) continue;
            seen.add(m[1]);
            let row = a.closest('tr') || a.parentElement;
            for (let i = 0; i < 6 && row; i++) {
              const t = (row.innerText || '').trim();
              if (t.length > 20 && t.length < 2000) break;
              row = row.parentElement;
            }
            const text = ((row && row.innerText) || a.innerText || '').replace(/\\s+/g, ' ').trim();
            results.push({ id: Number(m[1]), rowText: text.slice(0, 500) });
          }
          return results;
        }"""
    )
    out = []
    for ad in ads:
        m = STATUS_RE.search(ad["rowText"] or "")
        status = normalize_status(m.group(1)) if m else "Unknown"
        out.append({"id": ad["id"], "status": status, "rowText": ad["rowText"]})
    return out


async def parse_free_balance(page) -> float:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(800)
    overview = await page.locator("body").inner_text()
    for pat in (
        r"Budget:\s*💎?\s*([\d.]+)",
        r"💎\s*([\d.]+)",
        r"([\d.]+)\s*TON",
    ):
        m = re.search(pat, overview, re.I)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                continue
    return 0.0


async def delete_ad(page, ad_id: int) -> bool:
    await page.goto(
        f"https://ads.telegram.org/account/ad/{ad_id}", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(450)
    btn = page.locator("a.delete-ad-btn")
    if await btn.count() == 0:
        return False
    await btn.first.click()
    await page.wait_for_timeout(400)
    confirm = page.locator(
        ".pr-layer-delete-ad .popup-primary-btn, div.popup-button.popup-primary-btn"
    )
    if await confirm.count() == 0:
        return False
    await confirm.first.click()
    await page.wait_for_timeout(1100)
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
    await wrap.type(bot_query, delay=20)
    await page.wait_for_timeout(1000)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(700)
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
    await page.wait_for_timeout(700)
    clear = page.get_by_text("Clear Draft", exact=True)
    if await clear.count() and await clear.first.is_visible():
        await clear.first.click()
        await page.wait_for_timeout(400)

    await page.locator("label.pr-radio-tab", has_text="Bots").first.click()
    await page.wait_for_timeout(250)
    await page.locator("input[name=title]").fill(title)
    await page.locator("textarea[name=text]").fill(text)
    await page.locator("input[name=promote_url]").fill(PROMOTE)
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
    await page.wait_for_timeout(2400)
    body = await page.locator("body").inner_text()
    ok = "Create a new ad" in body or (
        "/account/ad/" in page.url and "/new" not in page.url
    )
    if "balance is too low" in body.lower() or "Please choose target" in body:
        ok = False
    print(("OK" if ok else "FAIL"), idx, title, "→", selected)
    return {
        "title": title,
        "text": text,
        "bot": bot,
        "selected": selected,
        "ok": ok,
    }


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2200}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(900)

        before = await parse_free_balance(page)
        ads = await parse_ads(page)
        print(f"before_balance={before} ads={len(ads)}")

        deleted: list[int] = []
        for a in ads:
            if await delete_ad(page, a["id"]):
                deleted.append(a["id"])

        await page.wait_for_timeout(1200)
        unlocked = await parse_free_balance(page)
        budget_each = float(BUDGET)
        max_ads = int(unlocked // budget_each)
        plan = CAMPAIGNS[:max_ads]
        print(f"after_delete_balance={unlocked} max_ads={max_ads} planning={len(plan)}")

        created: list[dict] = []
        for i, (title, text) in enumerate(plan, start=1):
            bot = BOTS[(i - 1) % len(BOTS)]
            r = await create_bot_ad(page, title, text, bot, i)
            if not r.get("ok") and r.get("reason") == "bot_not_found":
                for alt in BOTS:
                    if alt == bot:
                        continue
                    r = await create_bot_ad(page, title, text, alt, i)
                    if r.get("ok"):
                        break
            created.append(r)
            await page.wait_for_timeout(350)

        final_bal = await parse_free_balance(page)
        ads2 = await parse_ads(page)
        statuses: dict[str, int] = {}
        for a in ads2:
            statuses[a["status"]] = statuses.get(a["status"], 0) + 1

        out = {
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "balance_before": before,
            "balance_after_delete": unlocked,
            "balance_final": final_bal,
            "deleted_ids": deleted,
            "created_ok": sum(1 for c in created if c.get("ok")),
            "created": created,
            "statuses": statuses,
            "ids": [a["id"] for a in ads2],
            "ads": ads2,
        }
        Path("/tmp/ads-max-fill-varied.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2)
        )
        print(
            json.dumps(
                {
                    k: out[k]
                    for k in (
                        "balance_before",
                        "balance_after_delete",
                        "balance_final",
                        "deleted_ids",
                        "created_ok",
                        "statuses",
                        "ids",
                    )
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

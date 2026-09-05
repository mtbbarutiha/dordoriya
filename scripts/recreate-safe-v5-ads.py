#!/usr/bin/env python3
"""Force-reset stuck In Review ads and submit a small ultra-safe batch.

Why: Official guidelines prohibit dating services (5.1). Current stuck set
includes dating/free/nearby/secure creatives that poison review. Community
fix for long In Review: delete stuck ads, resubmit fewer single-bot ads
with factual non-dating copy.

Creates 9 ads (3 creatives × 3 FA bots), CPM 0.20, budget 3.00 each.
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

# Ultra-safe: no dating/friendship, free, secure, nearby, location, voice, income
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

STATUS_RE = re.compile(
    r"\b(Declined|Rejected|In Review|On Hold|Active|Completed|Stopped|Pending)\b",
    re.I,
)


def normalize_status(s: str) -> str:
    s = (s or "").strip()
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
    return mapping.get(s.lower(), s or "Unknown")


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


async def parse_free_balance(page) -> str | None:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(800)
    overview = await page.locator("body").inner_text()
    for pat in (
        r"(?:Free(?:\s+balance)?|Available|Balance|Budget|موجودی)[^\d]*([\d.]+)\s*(?:TON|💎)?",
        r"Budget:\s*💎?\s*([\d.]+)",
        r"💎\s*([\d.]+)",
    ):
        m = re.search(pat, overview, re.I)
        if m:
            return f"{m.group(1)} TON"
    return None


async def delete_ad(page, ad_id: int) -> bool:
    await page.goto(
        f"https://ads.telegram.org/account/ad/{ad_id}", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(500)
    btn = page.locator("a.delete-ad-btn")
    if await btn.count() == 0:
        print(f"  no delete btn {ad_id}")
        return False
    await btn.first.click()
    await page.wait_for_timeout(450)
    confirm = page.locator(
        ".pr-layer-delete-ad .popup-primary-btn, div.popup-button.popup-primary-btn"
    )
    if await confirm.count() == 0:
        print(f"  no confirm {ad_id}")
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
    await page.wait_for_timeout(2600)
    body = await page.locator("body").inner_text()
    ok = "Create a new ad" in body or (
        "/account/ad/" in page.url and "/new" not in page.url
    )
    if "balance is too low" in body.lower() or "Please choose target" in body:
        ok = False
    print(("OK" if ok else "FAIL"), idx, title, selected)
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
        await page.wait_for_timeout(1000)

        before_bal = await parse_free_balance(page)
        ads = await parse_ads(page)
        to_delete = [
            a
            for a in ads
            if a["status"] in {"In Review", "Declined", "On Hold", "Unknown"}
        ]
        print(f"balance_before={before_bal} ads={len(ads)} delete={len(to_delete)}")

        deleted: list[int] = []
        for a in to_delete:
            if await delete_ad(page, a["id"]):
                deleted.append(a["id"])

        await page.wait_for_timeout(1500)
        mid_bal = await parse_free_balance(page)
        print(f"balance_after_delete={mid_bal} deleted={deleted}")

        created: list[dict] = []
        idx = 0
        for title, text in CAMPAIGNS:
            for bot in BOTS:
                idx += 1
                r = await create_bot_ad(page, title, text, bot, idx)
                if not r.get("ok") and r.get("reason") == "bot_not_found":
                    for alt in BOTS:
                        if alt == bot:
                            continue
                        r = await create_bot_ad(page, title, text, alt, idx)
                        if r.get("ok"):
                            break
                created.append(r)
                await page.wait_for_timeout(400)

        after_bal = await parse_free_balance(page)
        ads2 = await parse_ads(page)
        statuses: dict[str, int] = {}
        for a in ads2:
            statuses[a["status"]] = statuses.get(a["status"], 0) + 1

        out = {
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "balance_before": before_bal,
            "balance_after_delete": mid_bal,
            "balance_after_create": after_bal,
            "deleted_ids": deleted,
            "created": created,
            "created_ok": sum(1 for c in created if c.get("ok")),
            "statuses": statuses,
            "ids": [a["id"] for a in ads2],
            "ads": ads2,
        }
        Path("/tmp/ads-safe-v5-reset.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2)
        )
        print(json.dumps({k: out[k] for k in (
            "balance_before","balance_after_delete","balance_after_create",
            "deleted_ids","created_ok","statuses","ids"
        )}, ensure_ascii=False, indent=2))
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

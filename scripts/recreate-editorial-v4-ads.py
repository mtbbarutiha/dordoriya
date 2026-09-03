#!/usr/bin/env python3
"""Delete Declined ads and recreate with editorial-v4 creatives.

v4 addresses Telegram's 'Deceptive, misleading, or predatory advertising'
rejects: no free/cost/security claims, no nearby/age/dating-adjacent copy,
no feature laundry list that is not visible on the bot landing. Stick to
factual 'open the Telegram chat bot and follow in-bot steps' wording.
Only FA targets: melogap / Melochat_bot / NashenasBot.
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
    "3VQIGO7L1hpg1h1agS2rHCCKDrfwYsC6nRk3BrB71Jw8IhaTIyjfb6s_6x_4mT7A"
)

BOTS = ["melogap", "Melochat_bot", "NashenasBot"]
PROMOTE = "https://t.me/Dordoriya_bot"
CPM = "0.20"
BUDGET = "3.00"

# 11 fresh factual creatives (new vs editorial-v3; no emoji; single-line ≤160)
CAMPAIGNS = [
    (
        "ربات چت دوردوریا",
        "دوردوریا یک ربات چت در تلگرام است. برای شروع، ربات را باز کنید و گزینه Start را بزنید.",
    ),
    (
        "شروع گفتگو در دوردوریا",
        "با باز کردن ربات دوردوریا می‌توانید گفتگوی متنی را طبق راهنمای داخل ربات آغاز کنید.",
    ),
    (
        "دوردوریا در تلگرام",
        "دوردوریا رباتی برای چت متنی در تلگرام است. امکانات قابل استفاده پس از ورود به ربات دیده می‌شود.",
    ),
    (
        "ورود به دوردوریا",
        "برای ورود به ربات دوردوریا روی لینک بزنید. راهنمای استفاده همین‌جا داخل ربات در دسترس است.",
    ),
    (
        "چت با ربات دوردوریا",
        "ربات دوردوریا برای چت در تلگرام ساخته شده است. پس از Start می‌توانید از منوی ربات استفاده کنید.",
    ),
    (
        "معرفی کوتاه دوردوریا",
        "دوردوریا ربات چت تلگرامی است. جزئیات سرویس و گزینه‌ها را پس از باز کردن ربات مشاهده کنید.",
    ),
    (
        "فعال‌سازی دوردوریا",
        "ربات دوردوریا را در تلگرام باز کنید، Start را بزنید و طبق پیام‌های ربات ادامه دهید.",
    ),
    (
        "گفتگوی متنی دوردوریا",
        "اگر به دنبال یک ربات چت متنی در تلگرام هستید، دوردوریا را باز کنید و از منوی آن استفاده کنید.",
    ),
    (
        "مسیر دسترسی دوردوریا",
        "این لینک شما را به ربات دوردوریا می‌رساند. مراحل بعدی داخل خود ربات نمایش داده می‌شود.",
    ),
    (
        "دوردوریا بات تلگرام",
        "دوردوریا یک بات تلگرام برای چت است. برای دیدن امکانات فعلی، ربات را باز و شروع کنید.",
    ),
    (
        "راهنمای شروع دوردوریا",
        "برای شروع کار با دوردوریا، ربات را باز کنید و دستورهای داخل ربات را دنبال نمایید.",
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


async def parse_ads_from_table(page) -> list[dict]:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    ads = await page.evaluate(
        """() => {
          const results = [];
          const links = Array.from(document.querySelectorAll("a[href*='/account/ad/']"));
          const seen = new Set();
          for (const a of links) {
            const m = (a.getAttribute('href') || '').match(/\\/account\\/ad\\/(\\d+)/);
            if (!m) continue;
            const id = m[1];
            if (seen.has(id)) continue;
            seen.add(id);
            let row = a.closest('tr, .ad-row, .table-row, .pr-table-row, li, .item') || a.parentElement;
            for (let i = 0; i < 6 && row; i++) {
              const t = (row.innerText || '').trim();
              if (t.length > 20 && t.length < 2000) break;
              row = row.parentElement;
            }
            const text = ((row && row.innerText) || a.innerText || '').replace(/\\s+/g, ' ').trim();
            results.push({ id: Number(id), href: a.getAttribute('href'), rowText: text.slice(0, 500) });
          }
          return results;
        }"""
    )
    out = []
    for ad in ads:
        m = STATUS_RE.search(ad["rowText"] or "")
        status = normalize_status(m.group(1)) if m else "Unknown"
        title = ad["rowText"]
        tm = re.search(r"^(.*?)\s+t\.me/", ad["rowText"])
        if tm:
            title = tm.group(1).strip()
        out.append(
            {
                "id": ad["id"],
                "title": title,
                "status": status,
                "rowText": ad["rowText"],
            }
        )
    return out


async def fetch_decline_reason(page, ad_id: int) -> str:
    await page.goto(
        f"https://ads.telegram.org/account/ad/{ad_id}", wait_until="domcontentloaded"
    )
    await page.wait_for_timeout(700)
    body = await page.locator("body").inner_text()
    for pat in (
        r"Deceptive, misleading, or predatory advertising[^\n]*",
        r"Editorial[^\n]{0,200}",
        r"Language mismatch[^\n]{0,200}",
        r"Irrelevant[^\n]{0,200}",
        r"(?:Reason|Decline reason|Rejection reason)[:\s]*([^\n]{5,300})",
    ):
        m = re.search(pat, body, re.I)
        if m:
            return m.group(0).strip()[:400]
    bits = await page.evaluate(
        """() => {
          const texts = [];
          const nodes = Array.from(document.querySelectorAll(
            '.decline, .declined, .alert, .notice, .warning, .error, .pr-alert, [class*=decline]'
          ));
          for (const n of nodes) {
            const t = (n.innerText || '').trim();
            if (t && t.length < 800) texts.push(t.slice(0, 500));
          }
          return texts.slice(0, 10);
        }"""
    )
    return " | ".join(bits)[:400] if bits else ""


async def parse_free_balance(page) -> str | None:
    await page.goto("https://ads.telegram.org/account/budget", wait_until="domcontentloaded")
    await page.wait_for_timeout(900)
    overview = await page.locator("body").inner_text()
    m = re.search(r"💎\s*([\d.]+)", overview)
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
        await page.wait_for_timeout(1000)

        balance_before = await parse_free_balance(page)
        ads = await parse_ads_from_table(page)
        Path("/tmp/editorial-v4-before.json").write_text(
            json.dumps(
                {"balance": balance_before, "ads": ads},
                ensure_ascii=False,
                indent=2,
            )
        )
        print("BEFORE", balance_before, {s: sum(1 for a in ads if a["status"] == s) for s in {a["status"] for a in ads}})

        declined = [a for a in ads if a["status"] == "Declined"]
        in_review = [a for a in ads if a["status"] == "In Review"]
        print(f"declined={len(declined)} in_review={len(in_review)}")

        declined_reasons = []
        for a in declined:
            reason = await fetch_decline_reason(page, a["id"])
            declined_reasons.append(
                {"id": a["id"], "title": a.get("title", ""), "reason": reason}
            )
            print(f"  declined {a['id']} {a.get('title')}: {reason[:160]}")

        deleted_ids: list[int] = []
        for a in declined:
            if await delete_ad(page, a["id"]):
                deleted_ids.append(a["id"])

        # Second pass for any leftover declined
        ads2 = await parse_ads_from_table(page)
        for a in ads2:
            if a["status"] == "Declined" and a["id"] not in deleted_ids:
                if await delete_ad(page, a["id"]):
                    deleted_ids.append(a["id"])

        balance_after_delete = await parse_free_balance(page)
        print("AFTER DELETE balance", balance_after_delete, "deleted", deleted_ids)

        n = len(deleted_ids) or len(declined)
        # Prefer exact same count as originally declined
        n = len(declined) if declined else n
        n = min(n, len(CAMPAIGNS)) if n else 0
        if len(declined) > len(CAMPAIGNS):
            # rotate campaigns if more declines than pool
            n = len(declined)

        print(f"\n=== CREATE editorial-v4 x{n} ===")
        results = []
        for i in range(n):
            title, text = CAMPAIGNS[i % len(CAMPAIGNS)]
            bot = BOTS[i % len(BOTS)]
            print(f"\n--- {i+1}/{n} {title} -> {bot}")
            r = await create_bot_ad(page, title, text, bot, i + 1)
            if not r.get("ok") and r.get("reason") == "bot_not_found":
                for alt in BOTS:
                    if alt == bot:
                        continue
                    r = await create_bot_ad(page, title, text, alt, i + 1)
                    if r.get("ok"):
                        break
            results.append(r)
            await page.wait_for_timeout(500)

        balance_final = await parse_free_balance(page)
        ads_final = await parse_ads_from_table(page)
        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(1100)
        overview = await page.locator("body").inner_text()
        Path("/tmp/editorial-v4-account.txt").write_text(overview)
        await page.screenshot(path="/tmp/editorial-v4-account.png", full_page=True)

        statuses = {}
        for a in ads_final:
            statuses[a["status"]] = statuses.get(a["status"], 0) + 1

        out = {
            "balance_before": balance_before,
            "balance_after_delete": balance_after_delete,
            "balance_final": balance_final,
            "declined_reasons": declined_reasons,
            "deleted_ids": deleted_ids,
            "created": results,
            "statuses": statuses,
            "ads": ads_final,
            "created_ok": sum(1 for r in results if r.get("ok")),
            "kept_in_review_before": [a["id"] for a in in_review],
        }
        Path("/tmp/editorial-v4-results.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2)
        )
        print(json.dumps({k: out[k] for k in (
            "balance_before", "balance_after_delete", "balance_final",
            "deleted_ids", "statuses", "created_ok", "declined_reasons",
        )}, ensure_ascii=False, indent=2))
        print(overview[:2800])
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

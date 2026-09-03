#!/usr/bin/env python3
"""One-shot Telegram Ads moderation tick for Dordoriya bot-targeted ads.

Parses account table statuses (authoritative), optionally deletes/recreates Declined,
writes /tmp/ads-moderation-tick.json.
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
# Mohammad — Personal Account (funded; org @Dordoriya_bot currently 0)
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "3VQIGO7L1hpg1h1agS2rHCCKDrfwYsC6nRk3BrB71Jw8IhaTIyjfb6s_6x_4mT7A"
)
BOTS = ["melogap", "Melochat_bot", "NashenasBot"]
CPM = "0.20"
BUDGET = "3.00"
PROMOTE = "https://t.me/Dordoriya_bot"
# Watch window: original batch 88–105 plus recreates (extend max as needed)
AD_ID_MIN = 88
AD_ID_MAX = 200

# Editorial-v4 creatives (factual; no free/security/nearby/age claims — deceptive fix)
CAMPAIGNS = [
    ("ربات چت دوردوریا", "دوردوریا یک ربات چت در تلگرام است. برای شروع، ربات را باز کنید و گزینه Start را بزنید."),
    ("شروع گفتگو در دوردوریا", "با باز کردن ربات دوردوریا می‌توانید گفتگوی متنی را طبق راهنمای داخل ربات آغاز کنید."),
    ("دوردوریا در تلگرام", "دوردوریا رباتی برای چت متنی در تلگرام است. امکانات قابل استفاده پس از ورود به ربات دیده می‌شود."),
    ("ورود به دوردوریا", "برای ورود به ربات دوردوریا روی لینک بزنید. راهنمای استفاده همین‌جا داخل ربات در دسترس است."),
    ("چت با ربات دوردوریا", "ربات دوردوریا برای چت در تلگرام ساخته شده است. پس از Start می‌توانید از منوی ربات استفاده کنید."),
    ("معرفی کوتاه دوردوریا", "دوردوریا ربات چت تلگرامی است. جزئیات سرویس و گزینه‌ها را پس از باز کردن ربات مشاهده کنید."),
    ("فعال‌سازی دوردوریا", "ربات دوردوریا را در تلگرام باز کنید، Start را بزنید و طبق پیام‌های ربات ادامه دهید."),
    ("گفتگوی متنی دوردوریا", "اگر به دنبال یک ربات چت متنی در تلگرام هستید، دوردوریا را باز کنید و از منوی آن استفاده کنید."),
    ("مسیر دسترسی دوردوریا", "این لینک شما را به ربات دوردوریا می‌رساند. مراحل بعدی داخل خود ربات نمایش داده می‌شود."),
    ("دوردوریا بات تلگرام", "دوردوریا یک بات تلگرام برای چت است. برای دیدن امکانات فعلی، ربات را باز و شروع کنید."),
    ("راهنمای شروع دوردوریا", "برای شروع کار با دوردوریا، ربات را باز کنید و دستورهای داخل ربات را دنبال نمایید."),
]

STATUS_RE = re.compile(
    r"\b(Declined|Rejected|In Review|On Hold|Active|Completed|Stopped|Pending)\b",
    re.I,
)


def normalize_status(s: str) -> str:
    s = s.strip().title() if s else "Unknown"
    mapping = {
        "In Review": "In Review",
        "On Hold": "On Hold",
        "Declined": "Declined",
        "Rejected": "Declined",
        "Active": "Active",
        "Completed": "Completed",
        "Stopped": "Stopped",
        "Pending": "In Review",
    }
    for k, v in mapping.items():
        if s.lower() == k.lower():
            return v
    return s


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
        # title: text before t.me/
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
    await page.wait_for_timeout(600)
    body = await page.locator("body").inner_text()
    reason = ""
    for pat in (
        r"Deceptive, misleading, or predatory advertising[^\n]*",
        r"(?:Reason|Decline reason|Rejection reason|علت|دلیل)[:\s]*([^\n]{5,300})",
        r"(Editorial[^\n]{0,200})",
        r"(Language mismatch[^\n]{0,200})",
        r"(Irrelevant[^\n]{0,200})",
        r"(Policy[^\n]{0,200})",
    ):
        m = re.search(pat, body, re.I)
        if m:
            reason = m.group(0).strip()[:400]
            break
    if not reason:
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
        reason = " | ".join(bits)[:400] if bits else ""
    return reason


async def parse_free_balance(page) -> str | None:
    await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
    await page.wait_for_timeout(800)
    overview = await page.locator("body").inner_text()
    for pat in (
        r"(?:Free(?:\s+balance)?|Available|Balance|Budget|موجودی)[^\d]*([\d.]+)\s*(?:TON|💎)?",
        r"Budget:\s*💎?\s*([\d.]+)",
        r"💎\s*([\d.]+)",
        r"([\d.]+)\s*TON",
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
    print(("OK" if ok else "FAIL"), idx, title, selected)
    return {
        "title": title,
        "text": text,
        "bot": bot,
        "selected": selected,
        "ok": ok,
    }


async def main() -> None:
    actions: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2200}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)

        free_balance = await parse_free_balance(page)
        all_ads = await parse_ads(page)
        ads = [a for a in all_ads if AD_ID_MIN <= a["id"] <= AD_ID_MAX]
        if not ads:
            ads = all_ads  # fallback if window empty
        await page.screenshot(path="/tmp/ads-moderation-overview.png", full_page=True)

        statuses: dict[str, int] = {}
        for a in ads:
            statuses[a["status"]] = statuses.get(a["status"], 0) + 1

        declined = [a for a in ads if a["status"] == "Declined"]
        in_review = [a for a in ads if a["status"] == "In Review"]
        active = [a for a in ads if a["status"] == "Active"]

        created: list[dict] = []
        deleted_ids: list[int] = []
        declined_reasons: list[dict] = []

        if declined:
            for a in declined:
                reason = await fetch_decline_reason(page, a["id"])
                declined_reasons.append(
                    {"id": a["id"], "title": a.get("title", ""), "reason": reason}
                )
                print(f"  declined {a['id']}: {reason[:120]}")

            actions.append(f"delete_declined:{len(declined)}")
            for a in declined:
                ok = await delete_ad(page, a["id"])
                if ok:
                    deleted_ids.append(a["id"])

            # Recreate same count with rotating bots / campaign pool
            n = len(declined)
            actions.append(f"recreate:{n}")
            for i in range(n):
                title, text = CAMPAIGNS[i % len(CAMPAIGNS)]
                # Prefer unused titles when possible: offset by deleted id
                bot = BOTS[i % len(BOTS)]
                r = await create_bot_ad(page, title, text, bot, i + 1)
                if not r.get("ok") and r.get("reason") == "bot_not_found":
                    for alt in BOTS:
                        if alt == bot:
                            continue
                        r = await create_bot_ad(page, title, text, alt, i + 1)
                        if r.get("ok"):
                            break
                created.append(r)

            # Re-parse after recreate (new ids may be > AD_ID_MAX)
            free_balance = await parse_free_balance(page)
            ads = await parse_ads(page)
            statuses = {}
            for a in ads:
                statuses[a["status"]] = statuses.get(a["status"], 0) + 1
            declined = [a for a in ads if a["status"] == "Declined"]
            in_review = [a for a in ads if a["status"] == "In Review"]
            active = [a for a in ads if a["status"] == "Active"]

        # Decide timer action
        all_active = len(ads) > 0 and len(active) == len(ads) and not declined and not in_review
        any_in_review = len(in_review) > 0
        if all_active:
            action = "all_active_unsubscribe"
            actions.append("unsubscribe_timer")
            actions.append("persian_approved")
            timer = "unsubscribe"
        elif any_in_review or declined:
            action = "still_waiting"
            actions.append("keep_timer")
            timer = "kept_resubscribed"
        else:
            # e.g. On Hold / mixed — keep watching
            action = "still_waiting"
            actions.append("keep_timer_nonterminal")
            timer = "kept_resubscribed"

        out = {
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "free_balance": free_balance,
            "statuses": statuses,
            "total": len(ads),
            "declined": [a["id"] for a in declined],
            "declined_reasons": declined_reasons,
            "active": len(active),
            "in_review": len(in_review),
            "ids": [a["id"] for a in ads],
            "ads": ads,
            "deleted_ids": deleted_ids,
            "created": created,
            "actions": actions,
            "action": action,
            "timer": timer,
            "delaySeconds": 900,
            "bot_channel": "none",
        }
        Path("/tmp/ads-moderation-tick.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2)
        )
        summary_keys = (
            "statuses",
            "total",
            "free_balance",
            "action",
            "timer",
            "actions",
            "declined",
            "declined_reasons",
            "active",
            "in_review",
        )
        print(json.dumps({k: out[k] for k in summary_keys}, ensure_ascii=False, indent=2))
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

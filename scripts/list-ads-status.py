#!/usr/bin/env python3
"""List all Telegram Ads with statuses and rejection reasons for declined ads."""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
# Mohammad — Personal Account (active funded ads account)
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "3VQIGO7L1hpg1h1agS2rHCCKDrfwYsC6nRk3BrB71Jw8IhaTIyjfb6s_6x_4mT7A"
)


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 2200}
        )
        page = await ctx.new_page()
        await page.goto(ACCOUNT, wait_until="domcontentloaded")
        await page.wait_for_timeout(1200)
        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)

        # Capture account overview
        overview = await page.locator("body").inner_text()
        Path("/tmp/ads-account-overview.txt").write_text(overview)
        await page.screenshot(path="/tmp/ads-account-overview.png", full_page=True)

        # Parse ad rows from overview text / DOM
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
                // climb to a row-like container
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

        # Balance / free funds
        balance_match = re.search(
            r"(?:Balance|Available|Free|موجودی|balance)[^\d]*([\d.]+)\s*TON",
            overview,
            re.I,
        )
        free_match = re.search(r"([\d.]+)\s*TON", overview)

        detailed = []
        for ad in ads:
            ad_id = ad["id"]
            await page.goto(
                f"https://ads.telegram.org/account/ad/{ad_id}",
                wait_until="domcontentloaded",
            )
            await page.wait_for_timeout(700)
            body = await page.locator("body").inner_text()
            title_el = page.locator("input[name=title], .ad-title, h1, h2")
            title = ""
            if await page.locator("input[name=title]").count():
                title = await page.locator("input[name=title]").input_value()
            status = "Unknown"
            for s in (
                "Declined",
                "Rejected",
                "In Review",
                "On Hold",
                "Active",
                "Completed",
                "Stopped",
                "Pending",
            ):
                if re.search(rf"\b{re.escape(s)}\b", body, re.I):
                    status = s
                    break
            # Also check Persian / common variants
            if status == "Unknown":
                if "رد شده" in body or "decline" in body.lower():
                    status = "Declined"
                elif "در حال بررسی" in body or "review" in body.lower():
                    status = "In Review"

            reason = ""
            # Look for decline reason blocks
            reason_patterns = [
                r"(?:Reason|Decline reason|Rejection reason|علت|دلیل)[:\s]*([^\n]{5,300})",
                r"(Editorial[^\n]{0,200})",
                r"(Language mismatch[^\n]{0,200})",
                r"(Policy[^\n]{0,200})",
            ]
            for pat in reason_patterns:
                m = re.search(pat, body, re.I)
                if m:
                    reason = m.group(0).strip()[:400]
                    break

            # Capture decline notice more carefully from DOM
            decline_bits = await page.evaluate(
                """() => {
                  const texts = [];
                  const nodes = Array.from(document.querySelectorAll(
                    '.decline, .declined, .ad-status, .status, .alert, .notice, .warning, .error, .pr-alert, [class*=decline], [class*=status]'
                  ));
                  for (const n of nodes) {
                    const t = (n.innerText || '').trim();
                    if (t && t.length < 800) texts.push(t.slice(0, 500));
                  }
                  return texts.slice(0, 20);
                }"""
            )

            detailed.append(
                {
                    "id": ad_id,
                    "title": title,
                    "status": status,
                    "reason": reason,
                    "rowText": ad.get("rowText", ""),
                    "declineBits": decline_bits,
                    "bodySnippet": body[:1500],
                }
            )
            print(f"AD {ad_id} status={status} title={title!r} reason={reason!r}")

        out = {
            "balance_hint": balance_match.group(0) if balance_match else None,
            "first_ton": free_match.group(0) if free_match else None,
            "overview_head": overview[:2500],
            "ads": detailed,
            "counts": {},
        }
        for d in detailed:
            out["counts"][d["status"]] = out["counts"].get(d["status"], 0) + 1

        Path("/tmp/ads-status.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2)
        )
        print(json.dumps(out["counts"], ensure_ascii=False, indent=2))
        print("TOTAL", len(detailed))
        await ctx.storage_state(path=str(AUTH))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

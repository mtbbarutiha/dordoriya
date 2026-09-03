#!/usr/bin/env python3
"""Delete ONLY remaining old ad(s) among #10-13. Keep bot ads #14+."""
from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

AUTH = Path.home() / ".config/telegram-ads-mcp/auth_state.json"
ACCOUNT = (
    "https://ads.telegram.org/choose_account/"
    "1yQ7Qf4ZBdN6UNKr_se_mbjPAvIVxquj7Z2SmtLCVxw5Q-yZvduUIjnM8EVFA90o"
)
DELETE_IDS = [10, 11, 12, 13]


def log(*a):
    print(*a, flush=True)


async def list_ids(page) -> list[int]:
    await page.goto(
        "https://ads.telegram.org/account",
        wait_until="domcontentloaded",
        timeout=60000,
    )
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


async def balance(page) -> str:
    text = await page.locator("body").inner_text()
    m = re.search(r"💎\s*([\d.]+)", text)
    return m.group(1) if m else "?"


async def ad_info(page, ad_id: int) -> dict:
    await page.goto(
        f"https://ads.telegram.org/account/ad/{ad_id}",
        wait_until="domcontentloaded",
        timeout=60000,
    )
    await page.wait_for_timeout(800)
    title = budget = ""
    try:
        title = await page.locator("input[name=title]").input_value()
    except Exception:
        pass
    try:
        budget = await page.locator("input[name=budget]").input_value()
    except Exception:
        pass
    body = await page.locator("body").inner_text()
    bots = ""
    bots_el = page.locator(".js-field-bots-wrap .selected-items")
    if await bots_el.count():
        bots = (await bots_el.first.inner_text()).strip()[:120]
    if bots:
        targeting = f"bot:{bots}"
    elif "Persian" in body or "all channels in Persian" in body:
        targeting = "persian_channels"
    else:
        targeting = "unknown"
    status = "unknown"
    for s in ("Declined", "On hold", "In review", "Active", "Stopped"):
        if s in body:
            status = s
            break
    return {
        "id": ad_id,
        "title": title,
        "budget": budget,
        "targeting": targeting,
        "status": status,
    }


async def delete_one(page, ad_id: int) -> dict:
    r: dict = {"id": ad_id, "ok": False}
    await page.goto(
        f"https://ads.telegram.org/account/ad/{ad_id}",
        wait_until="domcontentloaded",
        timeout=60000,
    )
    await page.wait_for_timeout(800)
    try:
        r["title"] = await page.locator("input[name=title]").input_value()
        r["budget"] = await page.locator("input[name=budget]").input_value()
    except Exception:
        r["title"] = r["budget"] = ""

    trigger = page.locator("a.delete-ad-btn")
    if await trigger.count() == 0:
        trigger = page.get_by_text("Delete Ad", exact=True)
    if await trigger.count() == 0:
        r["error"] = "no_delete_button"
        return r

    await trigger.first.click()
    log(f"  clicked Delete Ad link for #{ad_id}")

    # Wait for confirmation modal text
    try:
        await page.wait_for_function(
            """() => document.body.innerText.includes('Do you want to delete this ad')""",
            timeout=8000,
        )
        log("  modal text visible")
    except Exception as e:
        log("  modal wait:", e)
        await page.screenshot(path=f"/tmp/del-{ad_id}-nomodal.png")

    await page.screenshot(path=f"/tmp/del-{ad_id}-modal.png")

    # Dump modal HTML for debugging
    modal_html = await page.evaluate(
        """() => {
          const all = Array.from(document.querySelectorAll('div, section, aside'));
          const m = all.find(el => (el.innerText||'').includes('Do you want to delete this ad'));
          if (!m) return null;
          // climb to a reasonable modal root
          let root = m;
          for (let i = 0; i < 6 && root.parentElement; i++) {
            const p = root.parentElement;
            if ((p.innerText||'').includes('Cancel') && (p.innerText||'').includes('Delete')) {
              root = p;
            } else break;
          }
          return {
            cls: String(root.className || ''),
            html: root.outerHTML.slice(0, 2000),
            text: (root.innerText||'').slice(0, 400),
          };
        }"""
    )
    log("  modal_html:", json.dumps(modal_html, ensure_ascii=False)[:800] if modal_html else None)
    r["modal"] = modal_html

    # Click the modal's Delete (exact text, not Delete Ad)
    clicked = await page.evaluate(
        """() => {
          const cls = (el) => String(el.getAttribute('class') || '');
          // Find smallest element containing both Cancel and Delete and the question
          const all = Array.from(document.querySelectorAll('*'));
          const withQ = all.filter(el => {
            const t = el.innerText || '';
            return t.includes('Do you want to delete this ad') && t.includes('Cancel') && /\\bDelete\\b/.test(t);
          });
          // pick the smallest by text length
          withQ.sort((a,b) => (a.innerText||'').length - (b.innerText||'').length);
          const root = withQ[0] || document.body;

          // Prefer button/a/span whose OWN text is exactly Delete
          const clickables = Array.from(root.querySelectorAll('button, a, span, div, input'));
          const exact = clickables.filter(el => {
            // use child text nodes only if possible
            const own = Array.from(el.childNodes)
              .filter(n => n.nodeType === 3)
              .map(n => n.textContent.trim())
              .join('');
            const t = own || (el.children.length === 0 ? (el.textContent||'').trim() : '');
            return t === 'Delete';
          });
          // Also match elements whose trimmed full text is Delete and few children
          const exact2 = clickables.filter(el => (el.textContent||'').trim() === 'Delete');
          const pick = exact[0] || exact2.find(el => el.tagName === 'BUTTON' || el.tagName === 'A') || exact2[0];
          if (!pick) {
            return {ok:false, exact: exact.length, exact2: exact2.length, rootCls: cls(root)};
          }
          pick.click();
          return {ok:true, tag: pick.tagName, cls: cls(pick), text: (pick.textContent||'').trim()};
        }"""
    )
    log("  js click result:", clicked)
    r["confirm"] = clicked

    if not clicked.get("ok"):
        # Playwright fallbacks
        for locator in [
            page.locator(".modal-footer >> text=Delete"),
            page.locator(".popup-buttons >> text=Delete"),
            page.locator(".modal >> text=Delete"),
            page.get_by_role("button", name="Delete", exact=True),
            page.locator("button:has-text('Delete')"),
        ]:
            try:
                if await locator.count() and await locator.first.is_visible():
                    await locator.first.click()
                    log("  clicked via locator fallback")
                    clicked = {"ok": True, "via": "locator"}
                    r["confirm"] = clicked
                    break
            except Exception as e:
                log("  locator try fail:", e)

    if not clicked.get("ok"):
        # Last resort: click the red Delete next to Cancel in viewport
        try:
            # Find Cancel then click sibling Delete
            cancel = page.get_by_text("Cancel", exact=True)
            if await cancel.count():
                parent = cancel.last.locator("xpath=..")
                delete_btn = parent.get_by_text("Delete", exact=True)
                if await delete_btn.count():
                    await delete_btn.last.click()
                    log("  clicked Delete sibling of Cancel")
                    clicked = {"ok": True, "via": "sibling"}
                    r["confirm"] = clicked
        except Exception as e:
            log("  sibling fail:", e)

    if not clicked.get("ok"):
        r["error"] = "modal_confirm_failed"
        await page.screenshot(path=f"/tmp/del-{ad_id}-fail.png")
        return r

    # Wait for completion
    for i in range(20):
        await page.wait_for_timeout(400)
        url = page.url
        still_modal = await page.evaluate(
            "() => document.body.innerText.includes('Do you want to delete this ad')"
        )
        if f"/account/ad/{ad_id}" not in url:
            log(f"  left ad page -> {url}")
            break
        if not still_modal:
            log("  modal gone")
            break
    else:
        log("  wait timed out, checking list anyway")

    await page.screenshot(path=f"/tmp/del-{ad_id}-after.png")
    ids = await list_ids(page)
    r["ok"] = ad_id not in ids
    r["ids_after"] = ids
    log(f"  delete ok={r['ok']} remaining={ids}")
    return r


async def main() -> None:
    log("auth exists:", AUTH.exists())
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = await browser.new_context(
            storage_state=str(AUTH), viewport={"width": 1440, "height": 900}
        )
        page = await ctx.new_page()
        page.set_default_timeout(60000)

        await page.goto(ACCOUNT, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1000)
        log("account url:", page.url)

        before_ids = await list_ids(page)
        before_bal = await balance(page)
        log("BEFORE balance=", before_bal, "ids=", before_ids)
        await page.screenshot(path="/tmp/ads-before-delete.png")

        to_delete = [i for i in DELETE_IDS if i in before_ids]
        keep = [i for i in before_ids if i not in DELETE_IDS]
        log("TO DELETE:", to_delete, "KEEP:", keep)

        for ad_id in to_delete:
            log("pre:", await ad_info(page, ad_id))

        results = []
        for ad_id in to_delete:
            log(f"\n=== DELETE #{ad_id} ===")
            results.append(await delete_one(page, ad_id))

        after_ids = await list_ids(page)
        after_bal = await balance(page)
        log("\nAFTER balance=", after_bal, "ids=", after_ids)
        await page.screenshot(path="/tmp/ads-after-delete.png")

        remaining = []
        for ad_id in after_ids:
            info = await ad_info(page, ad_id)
            remaining.append(info)
            log("remain:", info)

        await page.goto("https://ads.telegram.org/account", wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)
        body = await page.locator("body").inner_text()
        final_bal = await balance(page)
        await page.screenshot(path="/tmp/ads-final-list.png")

        summary = {
            "before_balance": before_bal,
            "after_balance": final_bal,
            "before_ids": before_ids,
            "after_ids": after_ids,
            "deleted": results,
            "remaining": remaining,
            "body": body[:5000],
        }
        Path("/tmp/delete-old-ads-result.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2)
        )
        log("\nDONE")
        log(json.dumps({k: v for k, v in summary.items() if k != "body"}, ensure_ascii=False, indent=2))
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

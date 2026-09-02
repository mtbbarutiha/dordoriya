#!/usr/bin/env python3
"""Create 4 Dordoriya Telegram Ads campaigns (dry-run by default).

Usage:
  # preview only (no spend):
  /agent/tools/telegram_ads_mcp/.venv/bin/python scripts/create-dordoriya-ads.py

  # actually create (spends TON):
  CONFIRM=1 /agent/tools/telegram_ads_mcp/.venv/bin/python scripts/create-dordoriya-ads.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path("/agent/tools/telegram_ads_mcp/src")))

from telegram_ads_mcp.client import TelegramAdsClient
from telegram_ads_mcp.paths import resolve_auth_state_path

BOT_URL = "https://t.me/Dordoriya_bot"
CPM = float(os.environ.get("ADS_CPM", "0.2"))
BUDGET = float(os.environ.get("ADS_BUDGET", "5"))
CONFIRM = os.environ.get("CONFIRM", "0") in ("1", "true", "yes")

CAMPAIGNS = [
    {
        "title": "دوردوریا · چت ناشناس",
        "text": "حرف بزن بدون لو رفتن هویت 🎭\nچت ناشناس یک‌به‌یک در دوردوریا — شروع رایگان",
        "url": BOT_URL,
        "website_name": "Dordoriya Bot",
        "show_bot_picture": True,
        "cpm": CPM,
        "initial_budget": BUDGET,
        "target_type": "channels",
        "targets": None,
        "daily_views_limit": 4,
        "status": "Active",
    },
    {
        "title": "دوردوریا · افراد نزدیک",
        "text": "آدم‌های نزدیکت رو پیدا کن 📍\nهم‌محلی‌ها آنلاین‌ان — یه سلام ساده بفرست",
        "url": BOT_URL,
        "website_name": "Dordoriya Bot",
        "show_bot_picture": True,
        "cpm": CPM,
        "initial_budget": BUDGET,
        "target_type": "channels",
        "targets": None,
        "daily_views_limit": 4,
        "status": "Active",
    },
    {
        "title": "دوردوریا · احراز چهره",
        "text": "پروفایل واقعی = اعتماد بیشتر ✅\nاحراز هوشمند چهره در دوردوریا",
        "url": BOT_URL,
        "website_name": "Dordoriya Bot",
        "show_bot_picture": True,
        "cpm": CPM,
        "initial_budget": BUDGET,
        "target_type": "channels",
        "targets": None,
        "daily_views_limit": 4,
        "status": "Active",
    },
    {
        "title": "دوردوریا · پیام و ویس",
        "text": "پیام دایرکت و ویس خصوصی 💌🎤\nگفتگو رو ساده‌تر شروع کن — @Dordoriya_bot",
        "url": BOT_URL,
        "website_name": "Dordoriya Bot",
        "show_bot_picture": True,
        "cpm": CPM,
        "initial_budget": BUDGET,
        "target_type": "channels",
        "targets": None,
        "daily_views_limit": 4,
        "status": "Active",
    },
]


async def main() -> None:
    auth = resolve_auth_state_path()
    if not auth.exists():
        print(f"AUTH missing: {auth}")
        print("Run telegram-ads-auth first.")
        sys.exit(1)

    print(f"confirm={CONFIRM} cpm={CPM} budget={BUDGET} auth={auth}")
    client = TelegramAdsClient(storage_state=auth, headless=True)
    try:
        accounts = await client.list_accounts()
        print("accounts:", json.dumps(accounts, ensure_ascii=False, indent=2))
        try:
            ads_before = await client.list_ads()
            print(f"existing ads: {len(ads_before)}")
        except Exception as e:
            print(f"list_ads skipped ({type(e).__name__}: {e})")

        for i, camp in enumerate(CAMPAIGNS, 1):
            print(f"\n--- campaign {i}/{len(CAMPAIGNS)}: {camp['title']} ---")
            result = await client.create_ad(confirm=CONFIRM, clear_draft=True, **camp)
            print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())

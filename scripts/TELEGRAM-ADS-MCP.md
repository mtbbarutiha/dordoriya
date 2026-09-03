# Telegram Ads MCP

MCP server for managing [Telegram Ads](https://ads.telegram.org) campaigns from Cursor.

## Install

```bash
bash scripts/setup-telegram-ads-mcp.sh
```

## Login (required once)

```bash
/agent/tools/telegram_ads_mcp/.venv/bin/telegram-ads-auth
```

1. Browser opens → log in with Telegram
2. Choose your ads account on the "Choose Account" screen
3. Wait until you see the ads table (`/account`)
4. Press Enter in the terminal to save session

Session file (never commit): `~/.config/telegram-ads-mcp/auth_state.json`

## Cursor config

Project MCP config: `.cursor/mcp.json`

If using **Cloud Agents**, also register the same server under:
**Dashboard → Integrations & MCP → Add server**

Optional env (prefer the **@Dordoriya_bot Organization**, not Mohammad personal):

```bash
export TELEGRAM_ADS_ACCOUNT="@Dordoriya_bot"
```

Canonical `choose_account` for scripts / ads-moderation-watch:

`https://ads.telegram.org/choose_account/1yQ7Qf4ZBdN6UNKr_se_mbjPAvIVxquj7Z2SmtLCVxw5Q-yZvduUIjnM8EVFA90o`

Budgets are **per account**. Funds on Mohammad personal do not apply to the Organization; top up the org via Fragment when recreating ads there.

## Available tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List ads accounts |
| `list_ads` | List all campaigns |
| `create_ad` | Create campaign (`confirm=True` to spend TON) |
| `set_cpm` | Change CPM |
| `set_status` | Active / On Hold |
| `increase_budget` | Add TON budget |

Financial tools default to dry-run until `confirm=True`.

## Security

`auth_state.json` equals your ads.telegram.org login — anyone with it can spend your TON budget.

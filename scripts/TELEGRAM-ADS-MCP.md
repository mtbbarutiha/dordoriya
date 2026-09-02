# Telegram Ads MCP

MCP server for managing [Telegram Ads](https://ads.telegram.org) from Cursor.

## Install

```bash
bash scripts/setup-telegram-ads-mcp.sh
```

## Login (required once)

```bash
tools/telegram_ads_mcp/.venv/bin/telegram-ads-auth
```

1. Browser opens → log in with Telegram
2. Choose your ads account
3. Wait until the ads table loads (`/account`)
4. Press Enter in the terminal

Session (never commit): `~/.config/telegram-ads-mcp/auth_state.json`

## Cursor

- Project config: `.cursor/mcp.json`
- **Cloud Agents:** also add under Dashboard → Integrations & MCP
- Restart Cursor / reload MCP after login

Optional:

```bash
export TELEGRAM_ADS_ACCOUNT="AccountNameSubstring"
```

## Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List ad accounts |
| `list_ads` | List campaigns |
| `create_ad` | New campaign (`confirm=True` spends TON) |
| `set_cpm` / `set_status` | Edit CPM or pause/resume |
| `increase_budget` | Add TON |

Financial tools dry-run until `confirm=True`.

## Security

`auth_state.json` = full ads.telegram.org access including TON spend.

#!/usr/bin/env bash
# نصب Telegram Ads MCP برای Cursor
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MCP_DIR="$ROOT/tools/telegram_ads_mcp"

echo "==> Telegram Ads MCP setup"
echo "    dir: $MCP_DIR"

if ! command -v python3 >/dev/null; then
  echo "python3 required" >&2
  exit 1
fi

if ! python3 -c "import venv" 2>/dev/null; then
  echo "Installing python3-venv..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq python3-venv
fi

cd "$MCP_DIR"
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -e .
.venv/bin/pip install 'mcp>=1.0.0,<2'
.venv/bin/playwright install chromium

AUTH_DIR="$HOME/.config/telegram-ads-mcp"
mkdir -p "$AUTH_DIR"
chmod 700 "$AUTH_DIR"

echo ""
echo "✅ Installed."
echo ""
echo "Next: log in to ads.telegram.org (one-time):"
echo "  $MCP_DIR/.venv/bin/telegram-ads-auth"
echo ""
echo "Optional env (account name substring if you have multiple):"
echo "  export TELEGRAM_ADS_ACCOUNT='YourAccountName'"
echo ""
echo "MCP config: $ROOT/.cursor/mcp.json"
echo "Restart Cursor / reload MCP servers after auth."

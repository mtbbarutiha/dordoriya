#!/usr/bin/env bash
# نصب Telegram Ads MCP برای Cursor
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MCP_DIR="$ROOT/tools/telegram_ads_mcp"
REPO="https://github.com/Free-cat/telegram_ads_mcp.git"

echo "==> Telegram Ads MCP setup"

if ! command -v python3 >/dev/null; then
  echo "python3 required" >&2
  exit 1
fi

if ! python3 -c "import venv" 2>/dev/null; then
  echo "Installing python3-venv..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq python3-venv
fi

if [ ! -d "$MCP_DIR" ]; then
  echo "Cloning $REPO ..."
  git clone --depth 1 "$REPO" "$MCP_DIR"
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
echo "✅ Installed at $MCP_DIR"
echo ""
echo "Next — one-time login to ads.telegram.org:"
echo "  $MCP_DIR/.venv/bin/telegram-ads-auth"
echo ""
echo "Optional (multiple ad accounts):"
echo "  export TELEGRAM_ADS_ACCOUNT='AccountNameSubstring'"
echo ""
echo "MCP config: $ROOT/.cursor/mcp.json"
echo "Restart Cursor or reload MCP servers after login."

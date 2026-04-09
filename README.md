# Telegram Market Watcher

Automated market monitoring bot for Telegram built with Node.js.

It runs in the background, tracks crypto, ETFs, index funds, and individual stocks, and notifies you when meaningful moves happen.

## Features

- Daily startup report with dashboard-style summary.
- Significant movement alerts with levels: Warning, Strong, Critical.
- Category-specific thresholds (crypto, ETF, index fund, stock).
- Price target alerts (`ABOVE` / `BELOW`).
- Weekly report (first Monday startup).
- Market open/close summary alerts.
- RSI(14) on report lines when enough history is available.
- Telegram commands for on-demand queries.
- Historical CSV output for analysis.
- Windows startup automation via Scheduled Tasks.

## Tech Stack

- Node.js 18+
- Telegram Bot API
- CoinGecko API (crypto)
- Yahoo Finance chart endpoint (ETFs, funds, stocks)

## Quick Start

```bash
npm install
copy .env.example .env
npm start
```

## Development Commands

```bash
npm run check
npm test
npm run ci
```

## Environment Variables

Configure your `.env` using `.env.example` as template.

```env
# Telegram
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_CHAT_ID=YOUR_CHAT_ID_HERE

# Markets to monitor
CRYPTO_IDS=bitcoin
ETF_SYMBOLS=SPY,QQQ,VOO,SAN
INDEX_FUND_SYMBOLS=VFIAX,SWPPX
STOCK_SYMBOLS=AAPL,NVDA,TSLA

# Optional price targets: SYMBOL:ABOVE/BELOW:PRICE
PRICE_TARGETS=BTC:ABOVE:90000,GLD:BELOW:400

# Check interval
CHECK_INTERVAL_MINUTES=15

# Thresholds by category (% vs previous check)
CRYPTO_WARNING_THRESHOLD_PERCENT=3
CRYPTO_STRONG_THRESHOLD_PERCENT=5
CRYPTO_CRITICAL_THRESHOLD_PERCENT=7

ETF_WARNING_THRESHOLD_PERCENT=1
ETF_STRONG_THRESHOLD_PERCENT=1.5
ETF_CRITICAL_THRESHOLD_PERCENT=2.5

INDEX_WARNING_THRESHOLD_PERCENT=1.5
INDEX_STRONG_THRESHOLD_PERCENT=2
INDEX_CRITICAL_THRESHOLD_PERCENT=3

STOCK_WARNING_THRESHOLD_PERCENT=1
STOCK_STRONG_THRESHOLD_PERCENT=1.5
STOCK_CRITICAL_THRESHOLD_PERCENT=2.5

# Analysis windows
ACCUMULATED_CHANGE_WINDOW_MINUTES=60
PRICE_HISTORY_RETENTION_HOURS=24
ALERT_COOLDOWN_MINUTES=60

# Market schedule alerts (local time)
MARKET_OPEN_HOUR=15
MARKET_OPEN_MINUTE=30
MARKET_CLOSE_HOUR=22
MARKET_CLOSE_MINUTE=0

# Telegram command polling
COMMAND_POLL_INTERVAL_SECONDS=30
```

## Telegram Commands

- `/help` or `/ayuda`: show commands
- `/report` or `/reporte`: send dashboard now
- `/price SYMBOL` or `/precio SYMBOL`: quote lookup
- `/status` or `/estado`: bot status

Example:

```text
/price SAN.MC
```

## Running in Background on Windows

Register startup task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-startup-task.ps1
```

Remove startup task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\unregister-startup-task.ps1
```

Logs are written to:

```text
logs/bot.log
```

## Data Files

- `data/state.json`: persisted runtime state
- `data/history.csv`: time-series quote log

## API Notes

- Use CoinGecko IDs for `CRYPTO_IDS` (e.g. `bitcoin`, `ethereum`).
- Use Yahoo Finance tickers for ETF/fund/stock symbols (e.g. `GLD`, `EEM`, `SAN.MC`).

## Security Notes

- Never commit `.env`.
- Rotate your Telegram bot token if exposed.
- Keep `TELEGRAM_CHAT_ID` private if you restrict command access.

## Community and Contribution

- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Pull request template: `.github/pull_request_template.md`
- Issue templates: `.github/ISSUE_TEMPLATE/`

## Disclaimer

This project is provided for informational and educational purposes only.
It is not financial advice. Always verify data and decisions independently.

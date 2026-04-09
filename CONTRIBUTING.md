# Contributing

Thanks for your interest in contributing.

## Getting Started

1. Fork the repository.
2. Create a feature branch from `main`.
3. Install dependencies: `npm install`.
4. Run checks before opening a PR:
   - `npm run check`
   - `npm test`

## Pull Request Guidelines

1. Keep PRs focused and small.
2. Include a clear description of what changed and why.
3. Update docs (`README.md`, `.env.example`) when behavior or configuration changes.
4. Avoid committing secrets (`.env`, tokens, chat IDs).

## Commit Style

Use clear, imperative commit messages.

Examples:
- `feat: add market-hours open/close alerts`
- `fix: prevent duplicate target alerts during cooldown`
- `docs: clarify Telegram command usage`

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Node.js version
- OS details

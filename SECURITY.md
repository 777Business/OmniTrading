# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability within OmniTrading, please disclose it responsibly. Do **NOT** report security vulnerabilities through public GitHub issues.

Please submit security vulnerability reports privately via **GitHub Private Vulnerability Reporting** on the repository:
https://github.com/777Business/OmniTrading/security/advisories/new

All vulnerability reports will be reviewed promptly.

---

## Critical User Security Rules

### 1. Never Commit or Share Your Credentials
- Never commit `.env` files, API keys, client secrets, or OAuth tokens to Git.
- OmniTrading is configured with `.gitignore` to prevent committing configuration directories and personal indicators.
- Never paste broker credentials into GitHub issues, discussions, or chat channels.

### 2. Local-Only Binding & Network Exposure Warning
- By default, OmniTrading binds strictly to `127.0.0.1` (localhost).
- If you deploy OmniTrading in Docker or bind to `0.0.0.0` to access it across your home Wi-Fi, you **MUST** configure a strong `OMNI_AUTH_TOKEN`.
- **Never expose OmniTrading to the public internet** without a secure reverse proxy, TLS encryption, and strict authentication. Anyone with network access to the server could execute trades on your connected broker accounts.

---

## Trading Risk Disclaimer

Trading financial instruments carries substantial risk of capital loss. OmniTrading is open-source software provided on an "AS IS" basis without warranty of any kind. OmniTrading is not a broker, holds no user funds, and provides no financial advice. Users are solely responsible for all orders executed through their connected accounts.

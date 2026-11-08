# MetaTrader 5 (MT5) Integration & Gateway Guide

This document describes how OmniTrading interfaces with MetaTrader 5 (MT5) broker accounts and prop firms (FTMO, IC Markets, Pepperstone, FundedNext, etc.).

---

## Architecture Overview

Unlike web-first broker APIs (such as cTrader Open API or Binance REST/WebSocket), MetaTrader 5 desktop terminals communicate exclusively via Windows IPC (Inter-Process Communication) and native C++ DLL bindings.

To connect OmniTrading's web UI to your local MT5 terminal, a local gateway service runs on your Windows machine:

```
┌─────────────────────────────────┐
│     OmniTrading Platform        │  (Browser / Desktop UI)
│   (Vela™ Charting Engine)       │
└────────────────┬────────────────┘
                 │ HTTP / WebSocket (localhost:8000)
                 ▼
┌─────────────────────────────────┐
│     Local MT5 Bridge Service    │  (scripts/mt5-bridge.py)
│    (Zero-cloud, 100% private)   │
└────────────────┬────────────────┘
                 │ Windows Native IPC
                 ▼
┌─────────────────────────────────┐
│   MetaTrader 5 Client Terminal  │  (FTMO / IC Markets / Pepperstone)
└────────────────┬────────────────┘
                 │ Broker Protocol
                 ▼
┌─────────────────────────────────┐
│      Broker Trade Servers       │
└─────────────────────────────────┘
```

---

## 1. Quickstart: Running the Local MT5 Bridge

1. Open your terminal (PowerShell or Command Prompt) on Windows.
2. Install the official MetaTrader 5 Python library:
   ```cmd
   pip install MetaTrader5
   ```
3. Start the local bridge:
   ```cmd
   python scripts/mt5-bridge.py --port 8000
   ```
4. In OmniTrading:
   - Click **Connect Broker** (topbar).
   - Select **MetaTrader 5 (Forex & Prop Firms)**.
   - Enter your server name and account login.
   - Set **Gateway Port** to `8000`.
   - Click **Connect Account**.

---

## 2. In-Development Status & Safety

> [!WARNING]
> The MetaTrader 5 adapter in OmniTrading is currently marked **IN DEVELOPMENT**. When the bridge service is not running or credentials are entered without an active bridge, orders are simulated in local browser memory and are **NOT** routed to a live broker.

Only connect and execute when you see the active bridge logs and have confirmed execution in your demo account first.

---

## 3. Supported Instruments & Prop Firm Symbols

The bridge supports major Forex pairs, Metals, and Indices:
- **XAUUSD / GOLD**: Standard 100 oz contract sizing.
- **NAS100 / US100 / USTEC**: Index CFD tick and lot calculation.
- **US30 / DJ30 / WS30**: Dow Jones CFD execution.
- **Forex Majors**: EURUSD, GBPUSD, USDJPY (standard 100k units).

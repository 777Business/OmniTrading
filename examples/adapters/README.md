# Template Broker Adapters (Examples - Not Functional)

> **NOTICE**: The adapters in this directory (`alpaca/` and `binance/`) are **template examples** intended for developer reference only. They are **not functional for live or paper trading** and are not included in the OmniTrading application runtime or broker picker.

These templates demonstrate how community developers can implement the [`BrokerAdapter`](../../src/brokers/types.ts) interface to connect OmniTrading to external exchanges or brokers.

## Wanted Adapters — Contributions Welcome

OmniTrading is looking for community-maintained adapters for:
- **Binance** (Spot, Futures)
- **Alpaca Markets** (US Stocks, Crypto)
- **Interactive Brokers** (TWS / Client Portal Web API)
- **OANDA** (v20 REST / Streaming API)
- **MetaTrader 4 / 5** (Bridge / Gateway)

If you would like to contribute an adapter:
1. Review the [`customBrokerAdapter.ts`](../../src/brokers/template/customBrokerAdapter.ts) starter template and [`types.ts`](../../src/brokers/types.ts).
2. Ensure credentials are handled strictly through `CredentialSchema` and stored locally in `~/.config/omni-trading/auth.json`.
3. Submit a Pull Request following [CONTRIBUTING.md](../../CONTRIBUTING.md).

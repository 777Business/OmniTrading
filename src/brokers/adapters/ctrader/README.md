# cTrader Open API Adapter (Beta)

This adapter enables OmniTrading to stream live tick and historical trendbar market data, retrieve account balances, and execute manual orders via **Spotware cTrader Open API**.

- **Status**: `Beta`
- **Official Documentation**: [cTrader Open API Documentation](https://openapi.ctrader.com/)
- **Developer Portal**: [cTrader Open API Applications](https://openapi.ctrader.com/apps)

---

## OAuth Scopes & Authentication

OmniTrading authenticates with Spotware's identity servers using standard OAuth 2.0. The following scopes are requested:

1. **`accounts`**: Required to list authorized trading accounts, account numbers, currencies, and balances.
2. **`trading`**: Required to place, modify, and close manual market and limit orders when authorized by the user.

### Bring Your Own Credentials
OmniTrading does **not** ship with hardcoded Client IDs, Client Secrets, or shared tokens. To connect:

1. Register a free Open API application at [openapi.ctrader.com/apps](https://openapi.ctrader.com/apps).
2. Set the redirect URI to:
   ```
   http://127.0.0.1:8787/api/auth/callback
   ```
3. Enter your **Client ID** and **Client Secret** into OmniTrading's Broker Setup dialog.
4. Click **Continue with cTrader** to authorize your account on Spotware's secure login page.

Credentials and access tokens are saved only in your local filesystem (`~/.config/omni-trading/auth.json`) with strict `0600` permissions. No credentials ever leave your machine.

---

## Testing & CI Verification

In automated CI environments, this adapter is tested against simulated WebSocket endpoints and mock account schemas. Real order execution should always be validated on a **demo account** before connecting any live trading accounts.

---

## Spotware Open API Terms

Users must read and follow Spotware's Open API terms themselves at https://openapi.ctrader.com/terms.


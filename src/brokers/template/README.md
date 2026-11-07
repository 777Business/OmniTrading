# How to Build a Broker Adapter for OmniTrading

OmniTrading is designed from the ground up to be **100% broker-neutral**. Any broker or exchange offering an API can be integrated with minimal code.

## Quickstart Guide

1. **Copy the Template**:
   Copy `src/brokers/template/customBrokerAdapter.ts` to `src/brokers/adapters/<your-broker-id>/adapter.ts`.

2. **Define Your Credential Schema**:
   Declare what information users must input to connect (e.g. API keys, account numbers, or OAuth details):
   ```ts
   public readonly credentialSchema: CredentialSchema = {
     authType: 'api-key', // 'api-key' | 'oauth' | 'none'
     fields: [
       { name: 'apiKey', label: 'API Key', type: 'text', required: true },
       { name: 'apiSecret', label: 'API Secret', type: 'password', required: true }
     ],
     docsUrl: 'https://broker.example.com/api-docs'
   };
   ```

3. **Implement the Core Lifecycle**:
   - `connect(credentials, env)`
   - `getAccounts()`
   - `selectAccount(id)`
   - `createDataProvider(account)` (Vela `DataProvider` for charts)
   - `getSymbolSpec(symbol)` (min/max volume, pip digits, lot size)
   - `placeOrder(order)` (market, limit, stop)

4. **Register Your Adapter**:
   Add your adapter class to `src/brokers/registry.ts`:
   ```ts
   import { MyBrokerAdapter } from './adapters/mybroker/adapter';
   registry.register(new MyBrokerAdapter());
   ```

OmniTrading will automatically generate the UI login dialog, environment toggles, validation rules, and topbar account switcher for your adapter.

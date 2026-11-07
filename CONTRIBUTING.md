# Contributing to OmniTrading

Thank you for your interest in contributing to OmniTrading! We welcome contributions from the community to expand broker adapters, enhance charting ergonomics, and improve trading safety.

## Code of Conduct

Please maintain a respectful, constructive, and collaborative environment across issues, pull requests, and discussions.

## How to Contribute

### 1. Adding a New Broker Adapter
OmniTrading is broker-neutral. If your favorite broker or exchange provides a public API, you can contribute a new adapter!
- Check `src/brokers/template/customBrokerAdapter.ts` and `src/brokers/template/README.md`.
- Implement the `BrokerAdapter` interface in `src/brokers/adapters/<broker-id>/adapter.ts`.
- Ensure experimental adapters default to Sandbox/Demo mode in their initial release.
- Include unit tests and link to official documentation.

### 2. Fixing Bugs & Improving UX
- Fork the repository and create a feature branch (`git checkout -b feature/my-feature`).
- Run the unit tests (`npm test`) before submitting a pull request.
- Ensure that Vela's attribution and watermark are never modified or obscured.
- Keep pull requests focused on a single change.

## Development Setup

```bash
git clone https://github.com/777Business/OmniTrading.git
cd OmniTrading
npm install
npm run build
npm test
npm start
```

Access the development server at `http://127.0.0.1:8787`.

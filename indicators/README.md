# OmniTrading Indicators & Plugin Guide

OmniTrading supports extensible technical indicators. You can use the built-in indicators provided by the charting engine or load your own custom indicators.

## Adding Custom Indicators

To keep your proprietary trading strategies and indicator code private, OmniTrading provides a local `custom-indicators/` directory:

1. Place your indicator scripts inside the `custom-indicators/` directory at the project root.
2. The `custom-indicators/` folder is included in `.gitignore` by default so your personal scripts will never be accidentally committed or published to GitHub.
3. OmniTrading automatically scans both `indicators/` and `custom-indicators/` at runtime and exposes them in the indicator picker.

## Indicator Format

Indicators can be written as:
- **Pine Script files (`.pine`)**: Standard indicator scripts. See `example_momentum_rsi.pine` for an example.
- **Vela Native Plugin SDK**: JavaScript/TypeScript indicator definitions utilizing `@luxalgo/vela` plugin interfaces.

### Example Indicator
Inspect `indicators/example_momentum_rsi.pine` for an MIT-licensed reference implementation featuring:
- Typed input parameters (`input.int`)
- Built-in technical analysis math (`ta.rsi`, `ta.sma`)
- Dynamic plot styling and threshold guidelines

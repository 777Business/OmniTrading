#!/usr/bin/env python3
"""
OmniTrading - Local MetaTrader 5 (MT5) Bridge Service

Connects OmniTrading to your locally installed MetaTrader 5 terminal on Windows
via the official MetaTrader 5 Python integration package.

Requirements:
    pip install MetaTrader5

Usage:
    python scripts/mt5-bridge.py [--port 8000]

Copyright (c) 2026 777Business
Licensed under the MIT License.
"""

import sys
import json
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False


class MT5BridgeHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Omni-Session')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def send_json(self, status_code, data):
        payload = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if not MT5_AVAILABLE:
            self.send_json(500, {
                'error': 'MetaTrader5 Python library is not installed. Run: pip install MetaTrader5',
                'connected': False,
            })
            return

        if path == '/api/status':
            terminal_info = mt5.terminal_info()
            account_info = mt5.account_info()
            self.send_json(200, {
                'connected': terminal_info is not None and terminal_info.connected,
                'terminal': terminal_info._asdict() if terminal_info else None,
                'account': account_info._asdict() if account_info else None,
            })
            return

        if path == '/api/positions':
            positions = mt5.positions_get()
            if positions is None:
                self.send_json(200, {'positions': []})
                return
            formatted = [p._asdict() for p in positions]
            self.send_json(200, {'positions': formatted})
            return

        if path == '/api/quote':
            symbol = query.get('symbol', ['EURUSD'])[0].upper()
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                self.send_json(404, {'error': f'Symbol {symbol} not found or no quote available'})
                return
            self.send_json(200, {
                'symbol': symbol,
                'bid': tick.bid,
                'ask': tick.ask,
                'last': tick.last,
                'volume': tick.volume,
                'time': int(tick.time_msc),
            })
            return

        self.send_json(404, {'error': 'Endpoint not found'})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if not MT5_AVAILABLE:
            self.send_json(500, {'error': 'MetaTrader5 library not installed'})
            return

        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8')
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {}

        if path == '/api/order':
            symbol = payload.get('symbol', 'EURUSD').upper()
            side = payload.get('side', 'buy').lower()
            volume = float(payload.get('volume', 0.01))
            sl = payload.get('stopLoss')
            tp = payload.get('takeProfit')

            tick = mt5.symbol_info_tick(symbol)
            if not tick:
                self.send_json(400, {'error': f'Cannot get tick for symbol {symbol}'})
                return

            price = tick.ask if side == 'buy' else tick.bid
            order_type = mt5.ORDER_TYPE_BUY if side == 'buy' else mt5.ORDER_TYPE_SELL

            req = {
                'action': mt5.TRADE_ACTION_DEAL,
                'symbol': symbol,
                'volume': volume,
                'type': order_type,
                'price': price,
                'deviation': 20,
                'magic': 777000,
                'comment': 'OmniTrading execution',
                'type_time': mt5.ORDER_TIME_GTC,
                'type_filling': mt5.ORDER_FILLING_IOC,
            }
            if sl:
                req['sl'] = float(sl)
            if tp:
                req['tp'] = float(tp)

            result = mt5.order_send(req)
            if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                self.send_json(200, {
                    'success': True,
                    'orderId': str(result.order),
                    'executionPrice': result.price,
                    'filledVolume': result.volume,
                })
            else:
                retcode = result.retcode if result else 'UNKNOWN'
                comment = result.comment if result else 'No response from terminal'
                self.send_json(400, {
                    'success': False,
                    'error': f'MT5 order rejected [{retcode}]: {comment}',
                })
            return

        self.send_json(404, {'error': 'Endpoint not found'})


def run(port=8000):
    if not MT5_AVAILABLE:
        print("[mt5-bridge] WARNING: 'MetaTrader5' Python package not found.")
        print("[mt5-bridge] Install it on Windows with: pip install MetaTrader5")
    else:
        print("[mt5-bridge] Initializing MetaTrader5 terminal connection...")
        if not mt5.initialize():
            print(f"[mt5-bridge] mt5.initialize() failed, error code = {mt5.last_error()}")
            print("[mt5-bridge] Ensure MetaTrader 5 terminal is installed and logged in.")
        else:
            info = mt5.terminal_info()
            print(f"[mt5-bridge] Connected to MetaTrader 5: {info.name} (build {info.build})")

    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, MT5BridgeHandler)
    print(f"[mt5-bridge] Local MT5 Bridge listening on http://127.0.0.1:{port}")
    print("[mt5-bridge] Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[mt5-bridge] Stopping bridge...")
        if MT5_AVAILABLE:
            mt5.shutdown()
        httpd.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='OmniTrading MetaTrader 5 Local Bridge')
    parser.add_argument('--port', type=int, default=8000, help='Port to listen on (default 8000)')
    args = parser.parse_args()
    run(port=args.port)

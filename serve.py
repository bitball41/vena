#!/usr/bin/env python3
"""Local static server for the Vena Steam demo web build. No cloud."""
from __future__ import annotations

import argparse
import mimetypes
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/octet-stream", ".pck")
mimetypes.add_type("text/javascript", ".js")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_response(self, code, message=None):
        self._vena_code = code
        super().send_response(code, message)

    def end_headers(self):
        code = getattr(self, "_vena_code", 200)
        if 200 <= code < 300:
            name = self.path.split("?", 1)[0]
            if name.endswith((".pck", ".wasm", ".js", ".png")) or ".part" in name:
                self.send_header("Cache-Control", "public, max-age=86400")
            else:
                self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "no-store")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def lan_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("1.1.1.1", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8069)
    args = parser.parse_args()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    ip = lan_ip()
    print("Vena Steam demo web build")
    print(f"  local:      http://127.0.0.1:{args.port}/")
    print(f"  chromebook: http://{ip}:{args.port}/")
    print("Ctrl+C to stop. Keep this PC and the Chromebook on the same Wi-Fi.")
    httpd.serve_forever()


if __name__ == "__main__":
    main()

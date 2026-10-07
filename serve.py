#!/usr/bin/env python3
"""Tiny classroom server for FLEX CODE Living Identity V5.
No external Python packages required.
"""
import argparse
import http.server
import os
import socket
import socketserver
from pathlib import Path


class ReuseTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # students always get the current files, even after an update mid class
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def guess_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "<YOUR-COMPUTER-IP>"


def open_server(host, port):
    # another Living Identity version may already hold the port, so walk upward
    last = None
    for candidate in range(port, port + 20):
        try:
            return ReuseTCPServer((host, candidate), NoCacheHandler), candidate
        except OSError as err:
            last = err
    raise last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--port', type=int, default=8080)
    args = ap.parse_args()

    os.chdir(Path(__file__).resolve().parent)
    httpd, port = open_server(args.host, args.port)
    with httpd:
        print("\nFLEX CODE Living Identity V5")
        print("----------------------------")
        if port != args.port:
            print(f"Port {args.port} was busy, using {port} instead")
        print(f"Local:     http://127.0.0.1:{port}")
        print(f"Classroom: http://{guess_ip()}:{port}")
        print("\nStudents must be able to reach this computer on the network.")
        print("Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()

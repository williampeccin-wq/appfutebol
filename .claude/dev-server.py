"""Servidor de desenvolvimento local do Harmonia FC.

Serve a pasta appfutebol_run SEM cache, para que cada edição de CSS/JS
apareça num F5 normal (o python -m http.server padrão cacheia e atrapalha
a iteração do redesign). Use apenas em desenvolvimento.
"""
import http.server
import socketserver
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "appfutebol_run")
os.chdir(ROOT)
PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


with Server(("", PORT), NoCacheHandler) as httpd:
    print(f"Harmonia dev server (no-cache) em http://localhost:{PORT}")
    httpd.serve_forever()

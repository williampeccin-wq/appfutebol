"""Servidor de desenvolvimento local do Harmonia FC.

Serve `appfutebol_run` SEM cache e injeta cache-bust por arquivo (?v=mtime)
no index.html e nos imports de modulo ES. Usar mtime (e nao um timestamp por
requisicao) e essencial: assim o MESMO modulo importado de varios lugares
recebe o MESMO ?v -> uma unica instancia (preserva singletons como state.js),
e o cache so quebra quando o arquivo e editado. So para desenvolvimento.
"""
import http.server
import socketserver
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "appfutebol_run")
os.chdir(ROOT)
PORT = 8000

_IMPORT_RE = re.compile(r"""((?:from|import)\s*['"])(\.\.?/[^'"?]+\.js)(['"])""")
_ASSET_RE = re.compile(r"""((?:href|src)=['"])(\.[^'"?]+\.(?:css|js))(['"])""")


def _mtime(fs_path):
    try:
        return str(int(os.path.getmtime(fs_path)))
    except OSError:
        return "0"


def _bust(text, base_dir):
    def repl(m):
        rel = m.group(2)
        target = os.path.normpath(os.path.join(base_dir, rel))
        return f"{m.group(1)}{rel}?v={_mtime(target)}{m.group(3)}"
    return _ASSET_RE.sub(repl, _IMPORT_RE.sub(repl, text))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        is_index = path in ("/", "/index.html")
        if is_index or path.endswith(".js"):
            fs = os.path.join(ROOT, "index.html") if is_index else self.translate_path(path)
            if os.path.isfile(fs):
                with open(fs, "r", encoding="utf-8") as fh:
                    body = _bust(fh.read(), os.path.dirname(fs)).encode("utf-8")
                ctype = "text/html" if is_index else "application/javascript"
                self.send_response(200)
                self.send_header("Content-Type", f"{ctype}; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        super().do_GET()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


with Server(("", PORT), Handler) as httpd:
    print(f"Harmonia dev server (no-cache + cache-bust por mtime) em http://localhost:{PORT}")
    httpd.serve_forever()

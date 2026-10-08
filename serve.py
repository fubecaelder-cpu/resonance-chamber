# Tiny static server for the VR room: explicit MIME types + HTTP Range support (for video).
# Usage: python serve.py [port]   (binds 127.0.0.1 only)
import http.server, os, re, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
sys.stderr = open(os.path.join(ROOT, 'serve.log'), 'a', buffering=1)
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
         '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
         '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'}

class Limited:
    def __init__(self, f, n): self.f, self.n = f, n
    def read(self, size=-1):
        if self.n <= 0: return b''
        size = self.n if size < 0 else min(size, self.n)
        b = self.f.read(size); self.n -= len(b); return b
    def close(self): self.f.close()

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def guess_type(self, path): return TYPES.get(os.path.splitext(path)[1].lower(), 'application/octet-stream')
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); self.send_header('Accept-Ranges', 'bytes'); super().end_headers()
    def send_head(self):
        path = self.translate_path(self.path); rng = self.headers.get('Range')
        m = re.match(r'bytes=(\d*)-(\d*)$', rng.strip()) if rng else None
        if not m or not os.path.isfile(path) or m.groups() == ('', ''): return super().send_head()
        size = os.path.getsize(path); a, b = m.groups()
        if a == '': start, end = max(0, size - int(b)), size - 1
        else: start, end = int(a), (int(b) if b else size - 1)
        end = min(end, size - 1)
        if start > end:
            self.send_response(416); self.send_header('Content-Range', 'bytes */%d' % size); self.end_headers(); return None
        f = open(path, 'rb'); f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(end - start + 1)); self.end_headers()
        return Limited(f, end - start + 1)

http.server.ThreadingHTTPServer.daemon_threads = True
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()

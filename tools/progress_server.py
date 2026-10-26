#!/usr/bin/env python3
"""
Smart Completions bridge for the PS5 cabinet dashboard.

Why this exists
---------------
The Smart Cloud dashboard at
  https://wly04-sc.intergraphsmartcloud.com/ISC/Tools/vDashboardsUsers/Switchboard.htm
needs a logged-in session.  A page served from localhost cannot read it directly:
the browser blocks the cross-origin request and would not send the site's cookies.

So this tiny service does the fetching on the server side and hands the app a
plain JSON document, with CORS enabled for the local app.

Run:
    python tools/progress_server.py

Endpoints
    GET  /progress   -> last known figures (cached in data/progress.json)
    POST /refresh    -> pull fresh figures from Smart Cloud, update the cache
    GET  /health     -> liveness

Configuration (tools/smartcloud.json, optional)
    {
      "cookie": "ASP.NET_SessionId=...; .ASPXAUTH=...",   # paste from the browser
      "dashboard": "https://wly04-sc.intergraphsmartcloud.com/ISC/Tools/vDashboardsUsers/Switchboard.htm",
      "subsystem": "PS5"
    }

If no cookie is configured the service still answers /progress with whatever is
cached, and /refresh returns a clear "needs connection" answer instead of failing.
"""

import json
import os
import re
import sys
import threading
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "progress.json")
CONF = os.path.join(ROOT, "tools", "smartcloud.json")

DEFAULT_DASH = ("https://wly04-sc.intergraphsmartcloud.com/ISC/Tools/"
                "vDashboardsUsers/Switchboard.htm")

LOCK = threading.Lock()


def load_conf():
    try:
        with open(CONF, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def read_cache():
    try:
        with open(CACHE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {
            "ok": False,
            "subsystem": "PS5",
            "percent": None,
            "source": "no data yet",
            "updated": None,
        }


def write_cache(doc):
    os.makedirs(DATA, exist_ok=True)
    tmp = CACHE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, CACHE)


# ---------------------------------------------------------------- extraction
# The dashboard renders Kendo widgets; the completion figure therefore appears
# in the HTML as a label followed by a number, or in a JSON payload.
NUM = r"(\d{1,3}(?:\.\d+)?)"


def find_percent(html, subsystem="PS5"):
    """Best-effort extraction of a completion percentage for the subsystem."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;?", " ", text)
    text = re.sub(r"\s+", " ", text)

    patterns = [
        r"completion\D{0,40}" + NUM + r"\s*%",
        r"progress\D{0,40}" + NUM + r"\s*%",
        r"complete\D{0,30}" + NUM + r"\s*%",
        r'"completion"\s*:\s*' + NUM,
        r'"percent(?:age)?"\s*:\s*' + NUM,
        r'"complete(?:d)?"\s*:\s*' + NUM,
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            val = float(m.group(1))
            if 0 <= val <= 100:
                return val, "dashboard text"

    # a bare "PS5 ... 63.4 %" style row
    m = re.search(re.escape(subsystem) + r"[^0-9]{0,40}" + NUM + r"\s*%", text, re.I)
    if m:
        val = float(m.group(1))
        if 0 <= val <= 100:
            return val, "subsystem row"

    return None, "pattern not found"


def fetch(url, cookie=None):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/html,application/json,*/*",
        "Accept-Language": "en-US,en;q=0.9",
    })
    if cookie:
        req.add_header("Cookie", cookie)
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
        ctype = resp.headers.get("Content-Type", "")
    for enc in ("utf-8", "cp1256", "latin-1"):
        try:
            return raw.decode(enc), ctype
        except Exception:
            continue
    return raw.decode("utf-8", "replace"), ctype


def refresh():
    conf = load_conf()
    url = conf.get("dashboard") or DEFAULT_DASH
    subsystem = conf.get("subsystem") or "PS5"
    cookie = conf.get("cookie") or ""

    doc = read_cache()
    try:
        html, ctype = fetch(url, cookie)
    except Exception as exc:
        doc.update(ok=False, source="fetch failed: %s" % exc)
        write_cache(doc)
        return doc, 502

    if "401.aspx" in html or "login" in html.lower() and len(html) < 4000:
        doc.update(ok=False, source="session not authorised — paste a cookie in tools/smartcloud.json")
        write_cache(doc)
        return doc, 401

    pct, how = find_percent(html, subsystem)
    doc.update(
        ok=pct is not None,
        subsystem=subsystem,
        percent=pct,
        source="Smart Cloud · %s (%s)" % (how, ctype.split(";")[0] or "html"),
        updated=_now(),
    )
    write_cache(doc)
    return doc, (200 if pct is not None else 404)


def _now():
    import datetime
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


# ---------------------------------------------------------------- http server
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, doc, code=200):
        body = json.dumps(doc, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            return self._json({"ok": True, "service": "smartcloud-bridge"})
        if self.path.startswith("/progress"):
            return self._json(read_cache())
        self._json({"ok": False, "error": "unknown endpoint"}, 404)

    def do_POST(self):
        if not self.path.startswith("/refresh"):
            return self._json({"ok": False, "error": "unknown endpoint"}, 404)
        with LOCK:
            doc, code = refresh()
        self._json(doc, code)

    def log_message(self, fmt, *args):
        sys.stderr.write("[bridge] %s\n" % (fmt % args))


def main():
    port = int(os.environ.get("PROGRESS_PORT", "8010"))
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Smart Completions bridge on http://127.0.0.1:%d" % port)
    print("  GET  /progress   cached figures")
    print("  POST /refresh    pull from Smart Cloud")
    srv.serve_forever()


if __name__ == "__main__":
    main()

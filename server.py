import http.server
import socketserver
import json
import os

PORT = 3001
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")


def read_json(path, default=None):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_GET(self):
        if self.path == "/api/data":
            data = read_json(DATA_FILE, {"events": [], "activities": [], "activeEventId": None})
            self.send_json(data)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/data":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                write_json(DATA_FILE, data)
                self.send_json({"ok": True})
            except json.JSONDecodeError:
                self.send_json({"error": "Invalid JSON"}, 400)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        if args and "404" in str(args[0]):
            super().log_message(format, *args)


if __name__ == "__main__":
    os.chdir(BASE_DIR)
    print(f"Strava Challenge Tracker @ http://localhost:{PORT}")

    class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True

    ThreadedServer(("", PORT), Handler).serve_forever()

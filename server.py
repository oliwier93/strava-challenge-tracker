import http.server
import socketserver
import json
import os
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime

PORT = 3001
BASE_DIR = os.getcwd()
DATA_FILE = os.path.join(BASE_DIR, "data.json")
STRAVA_CONFIG_FILE = os.path.join(BASE_DIR, "strava_config.json")
STRAVA_TOKENS_FILE = os.path.join(BASE_DIR, "strava_tokens.json")

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_URL = "https://www.strava.com/api/v3"
REDIRECT_URI = f"http://localhost:{PORT}/api/strava/callback"

STRAVA_TYPE_MAP = {
    "Run": "running", "TrailRun": "running", "VirtualRun": "running",
    "Ride": "cycling", "VirtualRide": "cycling", "GravelRide": "cycling",
    "MountainBikeRide": "cycling", "EBikeRide": "cycling",
    "Walk": "walking", "Hike": "walking",
}


def read_json(path, default=None):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_strava_config():
    return read_json(STRAVA_CONFIG_FILE)


def get_strava_tokens():
    return read_json(STRAVA_TOKENS_FILE)


def save_strava_tokens(tokens):
    write_json(STRAVA_TOKENS_FILE, tokens)


def refresh_token_if_needed(tokens):
    if tokens.get("expires_at", 0) > datetime.now().timestamp() + 60:
        return tokens
    config = get_strava_config()
    if not config:
        return None
    params = urllib.parse.urlencode({
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "grant_type": "refresh_token",
        "refresh_token": tokens["refresh_token"],
    }).encode()
    try:
        req = urllib.request.Request(STRAVA_TOKEN_URL, data=params, method="POST")
        with urllib.request.urlopen(req) as resp:
            new_tokens = json.loads(resp.read())
            tokens["access_token"] = new_tokens["access_token"]
            tokens["refresh_token"] = new_tokens["refresh_token"]
            tokens["expires_at"] = new_tokens["expires_at"]
            save_strava_tokens(tokens)
            return tokens
    except Exception:
        return None


def fetch_strava_activities(access_token, after=None):
    all_activities = []
    page = 1
    per_page = 100
    while True:
        params = {"page": str(page), "per_page": str(per_page)}
        if after:
            params["after"] = str(int(after))
        url = f"{STRAVA_API_URL}/athlete/activities?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {access_token}")
        with urllib.request.urlopen(req) as resp:
            activities = json.loads(resp.read())
        if not activities:
            break
        all_activities.extend(activities)
        if len(activities) < per_page:
            break
        page += 1
    return all_activities


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

        elif self.path == "/api/strava/status":
            config = get_strava_config()
            tokens = get_strava_tokens()
            self.send_json({
                "configured": config is not None,
                "connected": config is not None and tokens is not None,
                "client_id": config.get("client_id", "") if config else "",
            })

        elif self.path == "/api/strava/auth":
            config = get_strava_config()
            if not config:
                self.send_json({"error": "Strava nie skonfigurowana"}, 400)
                return
            params = urllib.parse.urlencode({
                "client_id": config["client_id"],
                "response_type": "code",
                "redirect_uri": REDIRECT_URI,
                "scope": "activity:read_all",
                "approval_prompt": "auto",
            })
            self.send_response(302)
            self.send_header("Location", f"{STRAVA_AUTH_URL}?{params}")
            self.end_headers()

        elif self.path.startswith("/api/strava/callback"):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            code = params.get("code", [None])[0]
            if not code:
                self.send_json({"error": "Brak kodu autoryzacyjnego"}, 400)
                return
            config = get_strava_config()
            if not config:
                self.send_json({"error": "Brak konfiguracji Strava"}, 400)
                return
            token_params = urllib.parse.urlencode({
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "code": code,
                "grant_type": "authorization_code",
            }).encode()
            try:
                req = urllib.request.Request(STRAVA_TOKEN_URL, data=token_params, method="POST")
                with urllib.request.urlopen(req) as resp:
                    token_data = json.loads(resp.read())
                save_strava_tokens({
                    "access_token": token_data["access_token"],
                    "refresh_token": token_data["refresh_token"],
                    "expires_at": token_data["expires_at"],
                    "athlete": token_data.get("athlete", {}).get("firstname", ""),
                })
                self.send_response(302)
                self.send_header("Location", "/?strava=connected")
                self.end_headers()
            except urllib.error.HTTPError as e:
                error_body = e.read().decode()
                self.send_json({"error": f"Blad autoryzacji: {error_body}"}, 400)

        elif self.path.startswith("/api/strava/sync"):
            tokens = get_strava_tokens()
            if not tokens:
                self.send_json({"error": "Nie polaczono ze Strava"}, 401)
                return
            tokens = refresh_token_if_needed(tokens)
            if not tokens:
                self.send_json({"error": "Nie udalo sie odswiezyc tokenu"}, 401)
                return
            try:
                app_data = read_json(DATA_FILE, {"events": [], "activities": [], "activeEventId": None})
                existing_strava_ids = {a.get("strava_id") for a in app_data["activities"] if a.get("strava_id")}
                after = datetime.now().timestamp() - (180 * 24 * 3600)
                strava_activities = fetch_strava_activities(tokens["access_token"], after=after)
                added = 0
                for sa in strava_activities:
                    strava_id = sa["id"]
                    if strava_id in existing_strava_ids:
                        continue
                    minutes = round(sa.get("moving_time", 0) / 60)
                    if minutes <= 0:
                        continue
                    activity_type = STRAVA_TYPE_MAP.get(sa.get("type", ""), "other")
                    date = sa.get("start_date_local", "")[:10]
                    app_data["activities"].append({
                        "id": int(datetime.now().timestamp() * 1000) + added,
                        "strava_id": strava_id,
                        "type": activity_type,
                        "name": sa.get("name", "Aktywnosc"),
                        "minutes": minutes,
                        "date": date,
                    })
                    added += 1
                write_json(DATA_FILE, app_data)
                self.send_json({"ok": True, "added": added, "total": len(strava_activities)})
            except urllib.error.HTTPError as e:
                error_body = e.read().decode()
                self.send_json({"error": f"Blad API Strava: {error_body}"}, 500)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)

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

        elif self.path == "/api/strava/config":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                config = json.loads(body)
                client_id = config.get("client_id", "").strip()
                client_secret = config.get("client_secret", "").strip()
                if not client_id or not client_secret:
                    self.send_json({"error": "Podaj Client ID i Client Secret"}, 400)
                    return
                write_json(STRAVA_CONFIG_FILE, {"client_id": client_id, "client_secret": client_secret})
                self.send_json({"ok": True})
            except json.JSONDecodeError:
                self.send_json({"error": "Invalid JSON"}, 400)

        elif self.path == "/api/strava/disconnect":
            if os.path.exists(STRAVA_TOKENS_FILE):
                os.remove(STRAVA_TOKENS_FILE)
            self.send_json({"ok": True})

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        if args and "404" in str(args[0]):
            super().log_message(format, *args)


if __name__ == "__main__":
    print(f"Strava Challenge Tracker @ http://localhost:{PORT}")
    print(f"Data dir: {BASE_DIR}")
    print(f"Data file exists: {os.path.exists(DATA_FILE)}")
    print(f"Strava config exists: {os.path.exists(STRAVA_CONFIG_FILE)}")
    print(f"Strava tokens exists: {os.path.exists(STRAVA_TOKENS_FILE)}")

    class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True

    ThreadedServer(("", PORT), Handler).serve_forever()

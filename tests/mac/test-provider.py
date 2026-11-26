"""Run an installed app's isolated smoke test against a loopback model service.

python3 tests/mac/test-provider.py /path/to/词匣.app/Contents/MacOS/PromptShelf
"""
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        auth = self.headers.get("Authorization")
        if self.path == "/team/v1/models" and auth == "Bearer fixture-only":
            self.reply(200, {"data": [{"id": "fixture-b"}, {"id": "fixture-a"}]})
        elif self.path == "/other/v1/models" and not auth:
            self.reply(200, {"data": [{"id": "local"}]})
        elif self.path == "/redirect/v1/models":
            self.send_response(302)
            self.send_header("Location", "/redirect-target")
            self.end_headers()
        else:
            self.server.unexpected.append(self.path)
            self.reply(403, {})

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if (self.path != "/team/v1/chat/completions"
                or self.headers.get("Authorization") != "Bearer fixture-only"
                or payload["messages"][-1] != {"role": "user", "content": "Summarize the project notes in an English email."}
                or payload["messages"][0]["role"] != "system"
                or "中文" not in payload["messages"][0]["content"]
                or "英文" not in payload["messages"][0]["content"]):
            self.server.unexpected.append(self.path)
            return self.reply(400, {})
        if payload["model"] == "fixture-b":
            return self.reply(429, {})
        self.reply(200, {"choices": [{"message": {"content": "根据项目记录撰写一封英文邮件，概括进展和下一步。"}}]})


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 0), Fixture) as server:
        server.unexpected = []
        threading.Thread(target=server.serve_forever, daemon=True).start()
        subprocess.run([sys.argv[1], "--smoke"], check=True, timeout=120,
                       env={**os.environ, "PS_SMOKE_AI_PORT": str(server.server_port)})
        assert not server.unexpected, server.unexpected

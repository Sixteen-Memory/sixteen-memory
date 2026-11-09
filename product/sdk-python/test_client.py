import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from sixteen_memory import SixteenMemory, MemoryAPIError, MemoryTransportError

calls = []
mode = "ok"

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass
    def do_GET(self):
        self.respond()
    def do_POST(self):
        self.respond()
    def do_PATCH(self):
        self.respond()
    def do_DELETE(self):
        self.respond()
    def respond(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        calls.append((self.command, self.path, self.headers.get("Authorization"), json.loads(raw) if raw else None))
        status, content = (200, b'{"id":"record","version":1}')
        if mode == "redirect":
            self.send_response(302); self.send_header("Location", "/secret"); self.end_headers(); return
        if mode == "bad": content = b"not JSON"
        if mode == "error": status, content = 409, b'{"error":{"code":"version_conflict","message":"secret raw data"}}'
        if mode == "large": content = b"x" * 2048
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(content)

class ClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
    def setUp(self):
        global mode
        mode = "ok"; calls.clear()
        self.client = SixteenMemory(self.base, "synthetic-" + "x" * 32)
    def test_lifecycle_and_scoped_operations(self):
        self.client.add(user_id="alice", request_id="request", content="text")
        self.client.update("memory", expected_version=1, reason="fix")
        self.client.delete("memory", 2)
        self.client.context("alice", "policy", max_chars=1000)
        self.client.create_conversation(user_id="alice", request_id="c", title="Title", messages=[])
        self.client.append_conversation("conversation", request_id="a", expected_version=1, messages=[])
        self.client.search_conversations("alice", "end")
        self.client.organize(user_id="alice", request_id="k", conversation_ids=["conversation"])
        self.client.resolve_knowledge("job", False)
        self.client.wiki("alice"); self.client.graph("alice")
        self.assertEqual(calls[1][0], "PATCH")
        self.assertEqual(calls[2][3]["expected_version"], 2)
        self.assertEqual(calls[3][3]["user_id"], "alice")
        self.assertTrue(all(call[2].startswith("Bearer synthetic-") for call in calls))
    def test_no_redirect_retry_or_error_body_leak(self):
        global mode
        mode = "redirect"
        with self.assertRaises(MemoryAPIError) as error: self.client.me()
        self.assertEqual(error.exception.code, "redirect_denied"); self.assertEqual(len(calls), 1)
        mode = "error"
        with self.assertRaises(MemoryAPIError) as error: self.client.me()
        self.assertEqual(error.exception.status, 409); self.assertNotIn("secret", str(error.exception))
        self.assertEqual(len(calls), 2)
    def test_limits_and_invalid_json(self):
        global mode
        mode = "bad"
        with self.assertRaises(MemoryTransportError): self.client.me()
        mode = "large"
        small = SixteenMemory(self.base, "x" * 32, max_response_bytes=1024)
        with self.assertRaises(MemoryTransportError) as error: small.me()
        self.assertEqual(error.exception.code, "response_too_large")
        before = len(calls)
        with self.assertRaises(MemoryTransportError): self.client.add(content="x" * 70000)
        with self.assertRaises(MemoryTransportError): self.client.get("../secret")
        self.assertEqual(len(calls), before)
    def test_private_config_validation(self):
        for base in ["http://external.example", "https://user:pass@host", "https://host?secret=yes"]:
            with self.assertRaises(MemoryTransportError): SixteenMemory(base, "x" * 32)
        with self.assertRaises(MemoryTransportError): SixteenMemory(self.base, "key\nInjected: bad")
        with self.assertRaises(MemoryTransportError): SixteenMemory(self.base, "x" * 32, timeout=0)

if __name__ == "__main__":
    unittest.main()

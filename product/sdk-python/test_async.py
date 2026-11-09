import asyncio
import inspect
import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs
from sixteen_memory import AsyncSixteenMemory, SixteenMemory, MemoryAPIError, MemoryTransportError


class Handler(BaseHTTPRequestHandler):
    calls = []
    def log_message(self, *_):
        pass
    def do_GET(self):
        self.respond()
    def do_POST(self):
        self.respond()
    def do_DELETE(self):
        self.respond()
    def respond(self):
        self.calls.append(self.path)
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if "/slow/" in self.path:
            time.sleep(.3)
        status, value = 200, {"id": "one"}
        if "/error/" in self.path:
            status, value = 409, {"error": {"code": "version_conflict", "message": "PRIVATE_SENTINEL"}}
        if "/redirect/" in self.path:
            self.send_response(302); self.send_header("Location", "/leak"); self.end_headers(); return
        if "/v1/memories?" in self.path:
            cursor = parse_qs(urlsplit(self.path).query).get("cursor", [""])[0]
            value = {"data": [{"id": cursor or "first"}], "next_cursor": None if cursor else "second"}
        if "/loop/" in self.path:
            value = {"data": [], "next_cursor": "same"}
        data = b"not-json" if "/invalid/" in self.path else json.dumps(value).encode()
        if "/large/" in self.path:
            data = b"x" * 2000
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass


class AsyncTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)
        cls.key = "synthetic-async-test-key-012345678901"
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    async def test_native_concurrency_cancellation_and_close(self):
        async with AsyncSixteenMemory(self.base + "/slow", self.key, timeout=2) as c:
            before = len(Handler.calls)
            pending = asyncio.create_task(c.me())
            for _ in range(100):
                if len(Handler.calls) > before:
                    break
                await asyncio.sleep(.005)
            self.assertEqual(len(Handler.calls), before + 1)
            self.assertFalse(pending.done(), "event loop progressed while HTTP was pending")
            pending.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await pending
            self.assertEqual(len(Handler.calls), before + 1, "cancellation must not retry")
        with self.assertRaises(MemoryTransportError) as error:
            await c.me()
        self.assertEqual(error.exception.code, "client_closed")

    async def test_timeout_errors_limits_and_no_redirect(self):
        for mode, expected in [("slow", "timeout"), ("invalid", "invalid_response"), ("large", "response_too_large")]:
            async with AsyncSixteenMemory(self.base + "/" + mode, self.key, timeout=.1 if mode == "slow" else 2, max_response_bytes=1000) as c:
                with self.assertRaises(MemoryTransportError) as error:
                    await c.me()
                self.assertEqual(error.exception.code, expected)
        for mode, expected in [("error", "version_conflict"), ("redirect", "redirect_denied")]:
            async with AsyncSixteenMemory(self.base + "/" + mode, self.key) as c:
                before = len(Handler.calls)
                with self.assertRaises(MemoryAPIError) as error:
                    await c.me()
                self.assertEqual(error.exception.code, expected)
                self.assertNotIn("PRIVATE_SENTINEL", str(error.exception))
                self.assertEqual(len(Handler.calls), before + 1)

    async def test_pagination_filters_and_shape(self):
        async with AsyncSixteenMemory(self.base, self.key) as c:
            data = await c.list_all("alice", filter={"field": "category", "op": "eq", "value": "support"})
            self.assertEqual([row["id"] for row in data], ["first", "second"])
            self.assertEqual([row["id"] for row in await c.list_all("alice", cursor="second", filter={"field": "category", "op": "eq", "value": "support"})], ["second"])
            for path in Handler.calls[-2:]:
                self.assertEqual(json.loads(parse_qs(urlsplit(path).query)["filter"][0])["value"], "support")
        async with AsyncSixteenMemory(self.base + "/loop", self.key) as c:
            with self.assertRaises(MemoryTransportError) as error:
                await c.list_all("alice")
            self.assertEqual(error.exception.code, "invalid_pagination")

    async def test_all_sync_user_methods_have_native_async_counterparts(self):
        for name, value in inspect.getmembers(SixteenMemory):
            if name.startswith("_") or not callable(value):
                continue
            counterpart = getattr(AsyncSixteenMemory, name)
            self.assertTrue(inspect.iscoroutinefunction(counterpart) or inspect.isasyncgenfunction(counterpart), name)
        async with AsyncSixteenMemory(self.base, self.key) as c:
            before = len(Handler.calls)
            with self.assertRaises(MemoryTransportError):
                await c.add(content="x" * 70000)
            self.assertEqual(len(Handler.calls), before)

    def test_sync_timeout_classification(self):
        c = SixteenMemory(self.base + "/slow", self.key, timeout=.05)
        with self.assertRaises(MemoryTransportError) as error:
            c.me()
        self.assertEqual(error.exception.code, "timeout")


if __name__ == "__main__":
    unittest.main()

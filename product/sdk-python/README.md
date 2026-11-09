# SixteenMemory Python SDK 0.3.1

Server-side Python 3.9+. The synchronous client has no runtime dependencies.
The optional native asyncio client uses `httpx==0.28.1`. No PyPI registry release.
Use the versioned website wheel or an authorized source checkout.

```sh
python -m pip install https://www.sixteenmemory.com/downloads/sixteen_memory-0.3.1-py3-none-any.whl
# Optional native async transport:
python -m pip install 'sixteen-memory[async] @ https://www.sixteenmemory.com/downloads/sixteen_memory-0.3.1-py3-none-any.whl'
```

## Store, retrieve and delete

Set `SIXTEEN_BASE_URL`, `SIXTEEN_API_KEY`, and `SIXTEEN_USER_ID` from trusted
server configuration. Obtain a **user-scoped** test key from the administrator;
there is no public self-signup. Never embed keys in browsers or URLs.

Download `lifecycle.py` or `async-lifecycle.py` from the website's `/downloads/`
and run it using the installed package. The same files in `product/examples/`
are executed by the installed-package acceptance test. They check models are
disabled, use unique synthetic records and delete only what they created.

```python
import os
from sixteen_memory import SixteenMemory

c = SixteenMemory(os.environ['SIXTEEN_BASE_URL'], os.environ['SIXTEEN_API_KEY'])
user = os.environ['SIXTEEN_USER_ID']
record = c.add(user_id=user, request_id='unique-retention-event', content='Prefers concise replies.',
    source={'type': 'manual', 'ref': 'example', 'text': 'Prefers concise replies.',
            'observed_at': '2026-11-09T00:00:00Z'})
try:
    results = c.search(user, 'concise')
finally:
    c.delete(record['id'], record['version'])
```

Do not reuse that example request ID for different content; use a fresh stable
ID for each real retention event. Deletes/updates require the returned version.

## Native async and cancellation

```python
import asyncio, os
from sixteen_memory import AsyncSixteenMemory

async def main():
    async with AsyncSixteenMemory(os.environ['SIXTEEN_BASE_URL'], os.environ['SIXTEEN_API_KEY']) as c:
        rows = await c.list_all(os.environ['SIXTEEN_USER_ID'])
        # Stream pages instead when materializing all results is undesirable:
        async for page in c.list_pages(os.environ['SIXTEEN_USER_ID']):
            pass  # consume page['data'] privately

asyncio.run(main())
```

Every user-facing sync method has a native async counterpart. Async context
exit closes connections; otherwise call `await c.aclose()`. Cancel an asyncio
task to propagate `CancelledError` and close its active response. No background
worker thread or implicit retry is used. Cancellation cannot undo a write already
accepted by the server: reconcile its request ID/version before manually retrying.
The async timeout bounds the overall request; the sync timeout is a socket timeout.
Do not invoke the synchronous client on an async application's event loop.

## Pagination, filters and failures

Both clients support `list_pages`/`list_all`, `export_pages`/`export_all`,
`conversations_pages`/`conversations_all` and
`conversation_pages`/`conversation_messages_all`. Async `*_pages` methods use
`async for`; other async methods use `await`. List/export accept `filter`, `at`
and `status`. Iterators retain those options and reject malformed or repeated
cursors; at most 1,000 continuing cursors are allowed. These are not snapshots;
concurrent changes can affect traversal. Use pages for bounded application memory.

`MemoryAPIError` exposes `status` and a bounded validated `code`, not the raw
service message. `MemoryTransportError` distinguishes `timeout`, `network_error`,
`invalid_input`, `invalid_config`, `invalid_response`, `invalid_pagination`,
`request_too_large`, `response_too_large`, and async `client_closed`.
Redirects and implicit retries are disabled. HTTPS is required except loopback
HTTP. Async HTTPX ignores environment proxy/CA settings by default (`trust_env=False`).
Request bodies are capped at 64 KiB; responses default to 16 MiB, configurable.

Memory lifecycle, context/evidence, ingestion, conversations, knowledge, wiki and
graph methods match the JS 0.3 user-facing surface in snake_case. Parameter shapes
follow Python conventions; admin/session helpers are intentionally JS-only.
Ingestion, generation and reindex may incur costs when enabled server-side;
client availability does not enable production models. MCP OAuth and write tools
are not part of this SDK release.

## Build and test

```sh
python -m build product/sdk-python
python product/sdk-python/test_package.py
cd product/sdk-python
python -m unittest -v test_client test_async
```

Async tests require the optional dependency. Cross-language installed-wheel and
lifecycle tests run through root `npm run check:ecosystem`; see
`product/ECOSYSTEM_RELEASE_2026-11-09.md` for prerequisites and release evidence.

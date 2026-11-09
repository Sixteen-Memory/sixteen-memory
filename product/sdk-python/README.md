# SixteenMemory Python SDK

Python 3.9+, standard-library only. Source distribution for trusted server
applications; no PyPI release is implied.

```sh
python -m pip install ./product/sdk-python
```

```python
import os
from sixteen_memory import SixteenMemory

memory = SixteenMemory(
    base_url=os.environ["SIXTEEN_BASE_URL"],
    api_key=os.environ["SIXTEEN_API_KEY"],
)
result = memory.context(
    user_id=os.environ["SIXTEEN_USER_ID"],
    query="delivery instructions",
    max_chars=6000,
)
print(result["context"])
```

Supports explicit memory lifecycle, ingestion, evidence and bounded context,
conversation append/search/paginated read/delete, knowledge organization/review,
wiki pages, and graph reads. Organization/ingestion require configured models and
may incur costs; review is the default. It never automatically stores responses.

Resolve user scope from authenticated application state. Use scoped keys on a
trusted server, not notebooks shared publicly or browser code. HTTPS is required
except HTTP loopback for local development. Redirects and implicit retries are
disabled. Request/response limits and socket timeouts apply. Synchronous only;
async applications can use an application-managed worker thread.

Reuse a request ID only for the identical operation. Updates and deletes require
the returned version. Conversation reads contain at most 32 messages; follow
`next_cursor`. Lists are pages, not transactional exports.

`MemoryAPIError` exposes `status` and a sanitized `code`.
`MemoryTransportError` does not disclose endpoints, credentials or raw provider
responses. Keep returned source data private.

## Build and test

Use an isolated environment with `build`, `setuptools>=77`, and `wheel`, then run:

```sh
python -m build product/sdk-python
python product/sdk-python/test_package.py
cd product/sdk-python
python -m unittest -v test_client
```

The wheel contains only the client package, its typing marker and package
metadata. Runtime integration checks are in `product/test/python-runtime.mjs`.

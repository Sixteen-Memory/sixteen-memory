"""Optional native asyncio HTTPX client; never wraps blocking IO in threads."""
import asyncio
import json
import re
from typing import Any, Dict

from .client import SixteenMemory, MemoryAPIError, MemoryTransportError, _page


class AsyncSixteenMemory(SixteenMemory):
    def __init__(self, base_url, api_key, timeout=30.0, max_response_bytes=16 * 1024 * 1024):
        super().__init__(base_url, api_key, timeout, max_response_bytes)
        try:
            import httpx
        except ImportError:
            raise ImportError("Install sixteen-memory[async] to use AsyncSixteenMemory") from None
        self._httpx = httpx
        self._http = httpx.AsyncClient(follow_redirects=False, trust_env=False, timeout=timeout,
                                      transport=httpx.AsyncHTTPTransport(retries=0, trust_env=False))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.aclose()

    async def aclose(self):
        await self._http.aclose()

    async def _request(self, path, method="GET", body=None):
        if self._http.is_closed:
            raise MemoryTransportError("client_closed")
        try:
            data = None if body is None else json.dumps(body, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError):
            raise MemoryTransportError("invalid_input") from None
        if data is not None and len(data) > 64 * 1024:
            raise MemoryTransportError("request_too_large")
        headers = {"Authorization": "Bearer " + self._api_key, "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"

        async def perform():
            async with self._http.stream(method, self._base_url + path, content=data, headers=headers) as response:
                status = response.status_code
                if 300 <= status < 400:
                    raise MemoryAPIError(status, "redirect_denied")
                raw = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(raw) + len(chunk) > self._max_bytes:
                        raise MemoryTransportError("response_too_large")
                    raw.extend(chunk)
                try:
                    result = json.loads(raw.decode("utf-8"))
                except (ValueError, UnicodeError):
                    if status >= 400:
                        raise MemoryAPIError(status, "request_failed") from None
                    raise MemoryTransportError("invalid_response") from None
                if status >= 400:
                    error = result.get("error", {}) if isinstance(result, dict) else {}
                    code = error.get("code", "") if isinstance(error, dict) else ""
                    if not isinstance(code, str) or not re.fullmatch(r"[a-z0-9_]{1,100}", code):
                        code = "request_failed"
                    raise MemoryAPIError(status, code)
                return result
        try:
            return await asyncio.wait_for(perform(), timeout=self._timeout)
        except (asyncio.TimeoutError, self._httpx.TimeoutException):
            raise MemoryTransportError("timeout") from None
        except self._httpx.HTTPError:
            raise MemoryTransportError("network_error") from None
        # CancelledError propagates; stream context closes the request. No retry.

    async def health(self):
        return await super().health()

    async def me(self):
        return await super().me()

    async def add(self, **data: Any):
        return await super().add(**data)

    async def get(self, memory_id: str):
        return await super().get(memory_id)

    async def update(self, memory_id: str, **data: Any):
        return await super().update(memory_id, **data)

    async def delete(self, memory_id: str, expected_version: int):
        return await super().delete(memory_id, expected_version)

    async def revoke(self, memory_id: str, expected_version: int, reason: str):
        return await super().revoke(memory_id, expected_version, reason)

    async def history(self, memory_id: str):
        return await super().history(memory_id)

    async def evidence(self, memory_id: str):
        return await super().evidence(memory_id)

    async def list(self, user_id: str, cursor: str='', status: str='all', *, filter=None, at=None):
        return await super().list(user_id, cursor, status, filter=filter, at=at)

    async def search(self, user_id: str, query: str, **options: Any):
        return await super().search(user_id, query, **options)

    async def context(self, user_id: str, query: str, **options: Any):
        return await super().context(user_id, query, **options)

    async def search_evidence(self, user_id: str, query: str, **options: Any):
        return await super().search_evidence(user_id, query, **options)

    async def review_memories(self, user_id: str, **options: Any):
        return await super().review_memories(user_id, **options)

    async def ingest(self, **data: Any):
        return await super().ingest(**data)

    async def resolve_ingestion(self, job_id: str, approve: bool):
        return await super().resolve_ingestion(job_id, approve)

    async def ingestion(self, job_id: str):
        return await super().ingestion(job_id)

    async def ingestions(self, user_id: str):
        return await super().ingestions(user_id)

    async def reindex(self, user_id: str, cursor: str=''):
        return await super().reindex(user_id, cursor)

    async def answer(self, user_id: str, query: str, **options: Any):
        return await super().answer(user_id, query, **options)

    async def export_page(self, user_id: str, cursor: str='', *, filter=None, at=None, status='all'):
        return await super().export_page(user_id, cursor, filter=filter, at=at, status=status)

    async def create_conversation(self, **data: Any):
        return await super().create_conversation(**data)

    async def append_conversation(self, conversation_id: str, **data: Any):
        return await super().append_conversation(conversation_id, **data)

    async def conversation(self, conversation_id: str, cursor: str=''):
        return await super().conversation(conversation_id, cursor)

    async def conversations(self, user_id: str, cursor: str=''):
        return await super().conversations(user_id, cursor)

    async def search_conversations(self, user_id: str, query: str, limit: int=10):
        return await super().search_conversations(user_id, query, limit)

    async def delete_conversation(self, conversation_id: str, expected_version: int):
        return await super().delete_conversation(conversation_id, expected_version)

    async def organize(self, **data: Any):
        return await super().organize(**data)

    async def knowledge_runs(self, user_id: str):
        return await super().knowledge_runs(user_id)

    async def knowledge_run(self, job_id: str):
        return await super().knowledge_run(job_id)

    async def resolve_knowledge(self, job_id: str, approve: bool):
        return await super().resolve_knowledge(job_id, approve)

    async def wiki(self, user_id: str):
        return await super().wiki(user_id)

    async def wiki_page(self, user_id: str, slug: str):
        return await super().wiki_page(user_id, slug)

    async def graph(self, user_id: str):
        return await super().graph(user_id)

    async def _iterate(self, fetch, field="data", cursor=""):
        seen = {cursor} if cursor else set()
        while True:
            page = await fetch(cursor)
            cursor = _page(page, seen, field)
            yield page
            if cursor is None:
                return

    async def list_pages(self, user_id, **options):
        cursor = options.pop("cursor", "")
        async for page in self._iterate(lambda next_cursor: self.list(user_id, cursor=next_cursor, **options), cursor=cursor):
            yield page

    async def list_all(self, user_id, **options):
        return [row async for page in self.list_pages(user_id, **options) for row in page["data"]]

    async def export_pages(self, user_id, **options):
        cursor = options.pop("cursor", "")
        async for page in self._iterate(lambda next_cursor: self.export_page(user_id, cursor=next_cursor, **options), cursor=cursor):
            yield page

    async def export_all(self, user_id, **options):
        return [row async for page in self.export_pages(user_id, **options) for row in page["data"]]

    async def conversations_pages(self, user_id, cursor=""):
        async for page in self._iterate(lambda next_cursor: self.conversations(user_id, next_cursor), cursor=cursor):
            yield page

    async def conversations_all(self, user_id):
        return [row async for page in self.conversations_pages(user_id) for row in page["data"]]

    async def conversation_pages(self, conversation_id, cursor=""):
        async for page in self._iterate(lambda next_cursor: self.conversation(conversation_id, next_cursor), "messages", cursor):
            yield page

    async def conversation_messages_all(self, conversation_id):
        return [row async for page in self.conversation_pages(conversation_id) for row in page["messages"]]

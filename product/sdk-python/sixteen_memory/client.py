import json
import os
import math
import re
import socket
from http.client import HTTPException
from typing import Any, Dict
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class MemoryAPIError(Exception):
    def __init__(self, status: int, code: str):
        self.status = status
        self.code = code
        super().__init__("SixteenMemory API error: {} ({})".format(code, status))


class MemoryTransportError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__("SixteenMemory transport error: " + code)


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _id(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:@-]{0,99}", value):
        raise MemoryTransportError("invalid_input")
    return quote(value, safe="")


def _params(**values):
    try:
        return urlencode({name: json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
                          if name == "filter" else value
                          for name, value in values.items() if value is not None})
    except (TypeError, ValueError):
        raise MemoryTransportError("invalid_input") from None


def _page(page, seen, field):
    if not isinstance(page, dict) or not isinstance(page.get(field), list) or "next_cursor" not in page:
        raise MemoryTransportError("invalid_response")
    cursor = page["next_cursor"]
    if cursor is not None and (not isinstance(cursor, str) or not cursor or cursor in seen or len(seen) >= 1000):
        raise MemoryTransportError("invalid_pagination")
    if cursor is not None:
        seen.add(cursor)
    return cursor


def _pages(fetch, field="data", cursor=""):
    seen = {cursor} if cursor else set()
    while True:
        page = fetch(cursor)
        cursor = _page(page, seen, field)
        yield page
        if cursor is None:
            return


class SixteenMemory:
    """Use only on a trusted server, with a key bound to the authenticated user."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0,
                 max_response_bytes: int = 16 * 1024 * 1024):
        try:
            if not isinstance(base_url, str) or any(ord(char) < 33 for char in base_url):
                raise ValueError()
            url = urlsplit(base_url)
            _ = url.port  # Validate malformed or out-of-range ports at construction.
            valid = (url.scheme == "https" or
                     (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")))
            valid = valid and bool(url.hostname) and not (url.username or url.password or url.query or url.fragment)
            if not valid:
                raise ValueError()
            if not re.fullmatch(r"[A-Za-z0-9_.-]{32,256}", api_key):
                raise ValueError()
            if isinstance(timeout, bool) or not math.isfinite(timeout) or timeout <= 0:
                raise ValueError()
            if type(max_response_bytes) is not int or max_response_bytes < 1:
                raise ValueError()
        except (ValueError, TypeError):
            raise MemoryTransportError("invalid_config") from None
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._max_bytes = max_response_bytes
        self._opener = build_opener(_NoRedirect())

    def _request(self, path: str, method: str = "GET", body: Any = None) -> Any:
        binary = method == "PUT" and re.fullmatch(r"/v1/media/uploads/[a-f0-9-]{36}/parts/[0-9]+", path)
        if binary and not isinstance(body, bytes):
            raise MemoryTransportError("invalid_input")
        try:
            data = body if binary else None if body is None else json.dumps(body, ensure_ascii=False, allow_nan=False,
                                                       separators=(",", ":")).encode("utf-8")
        except (ValueError, TypeError):
            raise MemoryTransportError("invalid_input") from None
        max_request = 8 * 1024 * 1024 if binary else 10 * 1024 * 1024 if path == "/v1/media/ingestions" and method == "POST" else 64 * 1024
        if data is not None and len(data) > max_request:
            raise MemoryTransportError("request_too_large")
        headers = {"Authorization": "Bearer " + self._api_key, "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/octet-stream" if binary else "application/json"
        req = Request(self._base_url + path, data=data, headers=headers, method=method)
        try:
            try:
                response = self._opener.open(req, timeout=self._timeout)
            except HTTPError as error:
                response = error
            with response:
                status = response.code
                if 300 <= status < 400:
                    raise MemoryAPIError(status, "redirect_denied")
                raw = response.read(self._max_bytes + 1)
                if len(raw) > self._max_bytes:
                    raise MemoryTransportError("response_too_large")
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
        except (TimeoutError, socket.timeout):
            raise MemoryTransportError("timeout") from None
        except URLError as error:
            code = "timeout" if isinstance(error.reason, (TimeoutError, socket.timeout)) else "network_error"
            raise MemoryTransportError(code) from None
        except (OSError, HTTPException):
            raise MemoryTransportError("network_error") from None

    def health(self) -> Dict[str, Any]:
        return self._request("/health")

    def me(self) -> Dict[str, Any]:
        return self._request("/v1/me")

    def add(self, **data: Any) -> Dict[str, Any]:
        return self._request("/v1/memories", "POST", data)

    def get(self, memory_id: str) -> Dict[str, Any]:
        return self._request("/v1/memories/" + _id(memory_id))

    def update(self, memory_id: str, **data: Any) -> Dict[str, Any]:
        return self._request("/v1/memories/" + _id(memory_id), "PATCH", data)

    def delete(self, memory_id: str, expected_version: int) -> Dict[str, Any]:
        return self._request("/v1/memories/" + _id(memory_id), "DELETE", {"expected_version": expected_version})

    def revoke(self, memory_id: str, expected_version: int, reason: str) -> Dict[str, Any]:
        return self._request("/v1/memories/" + _id(memory_id) + "/revoke", "POST",
                             {"expected_version": expected_version, "reason": reason})

    def history(self, memory_id: str) -> Any:
        return self._request("/v1/memories/" + _id(memory_id) + "/history")

    def evidence(self, memory_id: str) -> Any:
        return self._request("/v1/memories/" + _id(memory_id) + "/evidence")

    def list(self, user_id: str, cursor: str = "", status: str = "all", *, filter=None, at=None) -> Dict[str, Any]:
        return self._request("/v1/memories?" + _params(user_id=user_id, cursor=cursor, status=status, filter=filter, at=at))

    def search(self, user_id: str, query: str, **options: Any) -> Dict[str, Any]:
        return self._request("/v1/search", "POST", dict(options, user_id=user_id, query=query))

    def context(self, user_id: str, query: str, **options: Any) -> Dict[str, Any]:
        return self._request("/v1/context", "POST", dict(options, user_id=user_id, query=query))

    def search_evidence(self, user_id: str, query: str, **options: Any) -> Dict[str, Any]:
        return self._request("/v1/evidence/search", "POST", dict(options, user_id=user_id, query=query))

    def review_memories(self, user_id: str, **options: Any) -> Dict[str, Any]:
        return self._request("/v1/memory-review", "POST", dict(options, user_id=user_id))

    def ingest(self, **data: Any) -> Dict[str, Any]:
        return self._request("/v1/ingestions", "POST", data)

    def ingest_media(self, **data: Any) -> Dict[str, Any]:
        return self._request("/v1/media/ingestions", "POST", data)

    def create_media_upload(self, **data: Any):
        return self._request("/v1/media/uploads", "POST", data)

    def media_upload(self, upload_id: str):
        return self._request("/v1/media/uploads/" + _id(upload_id))

    def upload_media_part(self, upload_id: str, part: int, data: bytes):
        if type(part) is not int or part < 1 or part > 63:
            raise MemoryTransportError("invalid_input")
        return self._request("/v1/media/uploads/" + _id(upload_id) + "/parts/" + str(part), "PUT", data)

    def complete_media_upload(self, upload_id: str):
        return self._request("/v1/media/uploads/" + _id(upload_id) + "/complete", "POST")

    def cancel_media_upload(self, upload_id: str):
        return self._request("/v1/media/uploads/" + _id(upload_id), "DELETE")

    def upload_media(self, file_path: str, **data: Any):
        try:
            size = os.path.getsize(file_path)
        except (OSError, TypeError):
            raise MemoryTransportError("invalid_input") from None
        if size < 16 or size > 500 * 1024 * 1024:
            raise MemoryTransportError("invalid_input")
        upload = self.create_media_upload(size_bytes=size, **data)
        with open(file_path, "rb") as source:
            while upload["state"] == "uploading" and upload["received_bytes"] < size:
                source.seek(upload["received_bytes"])
                chunk = source.read(upload["part_size"])
                if not chunk:
                    raise MemoryTransportError("invalid_input")
                upload = self.upload_media_part(upload["id"], upload["next_part"], chunk)
        return self.complete_media_upload(upload["id"]) if upload["state"] == "uploading" else upload

    def resolve_ingestion(self, job_id: str, approve: bool) -> Dict[str, Any]:
        return self._request("/v1/ingestions/" + _id(job_id) + "/resolve", "POST", {"approve": approve})

    def ingestion(self, job_id: str) -> Dict[str, Any]:
        return self._request("/v1/ingestions/" + _id(job_id))

    def ingestions(self, user_id: str) -> Any:
        return self._request("/v1/ingestions?" + urlencode({"user_id": user_id}))

    def reindex(self, user_id: str, cursor: str = "") -> Dict[str, Any]:
        return self._request("/v1/reindex", "POST", {"user_id": user_id, "cursor": cursor})

    def answer(self, user_id: str, query: str, **options: Any) -> Dict[str, Any]:
        return self._request("/v1/answer", "POST", dict(options, user_id=user_id, query=query))

    def export_page(self, user_id: str, cursor: str = "", *, filter=None, at=None, status="all") -> Dict[str, Any]:
        return self._request("/v1/export?" + _params(user_id=user_id, cursor=cursor, filter=filter, at=at, status=status))

    def create_conversation(self, **data: Any) -> Dict[str, Any]:
        return self._request("/v1/conversations", "POST", data)

    def append_conversation(self, conversation_id: str, **data: Any) -> Dict[str, Any]:
        return self._request("/v1/conversations/" + _id(conversation_id) + "/messages", "POST", data)

    def conversation(self, conversation_id: str, cursor: str = "") -> Dict[str, Any]:
        return self._request("/v1/conversations/" + _id(conversation_id) + "?" + urlencode({"cursor": cursor}))

    def conversations(self, user_id: str, cursor: str = "") -> Dict[str, Any]:
        return self._request("/v1/conversations?" + urlencode({"user_id": user_id, "cursor": cursor}))

    def search_conversations(self, user_id: str, query: str, limit: int = 10) -> Dict[str, Any]:
        return self._request("/v1/conversations/search", "POST", {"user_id": user_id, "query": query, "limit": limit})

    def delete_conversation(self, conversation_id: str, expected_version: int) -> Dict[str, Any]:
        return self._request("/v1/conversations/" + _id(conversation_id), "DELETE", {"expected_version": expected_version})

    def organize(self, **data: Any) -> Dict[str, Any]:
        return self._request("/v1/knowledge/organize", "POST", data)

    def knowledge_runs(self, user_id: str) -> Any:
        return self._request("/v1/knowledge/runs?" + urlencode({"user_id": user_id}))

    def knowledge_run(self, job_id: str) -> Dict[str, Any]:
        return self._request("/v1/knowledge/runs/" + _id(job_id))

    def resolve_knowledge(self, job_id: str, approve: bool) -> Dict[str, Any]:
        return self._request("/v1/knowledge/runs/" + _id(job_id) + "/resolve", "POST", {"approve": approve})

    def wiki(self, user_id: str) -> Dict[str, Any]:
        return self._request("/v1/wiki?" + urlencode({"user_id": user_id}))

    def wiki_page(self, user_id: str, slug: str) -> Dict[str, Any]:
        return self._request("/v1/wiki/" + _id(slug) + "?" + urlencode({"user_id": user_id}))

    def graph(self, user_id: str) -> Dict[str, Any]:
        return self._request("/v1/knowledge/graph?" + urlencode({"user_id": user_id}))

    def list_pages(self, user_id: str, **options):
        cursor = options.pop("cursor", "")
        yield from _pages(lambda next_cursor: self.list(user_id, cursor=next_cursor, **options), cursor=cursor)

    def list_all(self, user_id: str, **options):
        return [row for page in self.list_pages(user_id, **options) for row in page["data"]]

    def export_pages(self, user_id: str, **options):
        cursor = options.pop("cursor", "")
        yield from _pages(lambda next_cursor: self.export_page(user_id, cursor=next_cursor, **options), cursor=cursor)

    def export_all(self, user_id: str, **options):
        return [row for page in self.export_pages(user_id, **options) for row in page["data"]]

    def conversations_pages(self, user_id: str, cursor: str = ""):
        yield from _pages(lambda next_cursor: self.conversations(user_id, next_cursor), cursor=cursor)

    def conversations_all(self, user_id: str):
        return [row for page in self.conversations_pages(user_id) for row in page["data"]]

    def conversation_pages(self, conversation_id: str, cursor: str = ""):
        yield from _pages(lambda next_cursor: self.conversation(conversation_id, next_cursor), "messages", cursor)

    def conversation_messages_all(self, conversation_id: str):
        return [row for page in self.conversation_pages(conversation_id) for row in page["messages"]]

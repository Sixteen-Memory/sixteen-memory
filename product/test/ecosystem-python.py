"""Installed-wheel acceptance probe; only synthetic data on a loopback Worker."""
import asyncio
import inspect
import json
import os
import time

import sixteen_memory
from sixteen_memory import AsyncSixteenMemory, MemoryAPIError, MemoryTransportError, SixteenMemory


base, key, user = (os.environ[name] for name in ("TEST_BASE", "TEST_KEY", "TEST_USER"))
client = SixteenMemory(base, key, timeout=5)


def pages(fetch):
    records, sizes, seen, cursor = [], [], set(), ""
    while True:
        page = fetch(cursor)
        sizes.append(len(page["data"]))
        records.extend(page["data"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
        assert cursor not in seen, "cursor loop"
        seen.add(cursor)
    assert len({row["id"] for row in records}) == len(records), "duplicate page record"
    return records, sizes


def api_error(work, status, code):
    try:
        work()
    except MemoryAPIError as error:
        assert (error.status, error.code) == (status, code), (error.status, error.code)
    else:
        raise AssertionError("expected API rejection")


if os.environ.get("TEST_PHASE") == "verify_cleanup":
    assert client.list(user)["data"] == []
    assert client.conversations(user)["data"] == []
    assert client.search(user, "EcosystemNeedle")["data"] == []
    print(json.dumps({"installed_python_after_js_cleanup": "passed"}))
    raise SystemExit(0)

memories, sizes = pages(lambda cursor: client.list(user, cursor))
exported, export_sizes = pages(lambda cursor: client.export_page(user, cursor))
assert sizes == export_sizes == [50, 1]
assert [row["id"] for row in memories] == [row["id"] for row in exported]
assert [row["id"] for row in client.list_all(user)] == [row["id"] for row in memories]
assert [row["id"] for row in client.export_all(user)] == [row["id"] for row in memories]
assert len(client.search(user, "EcosystemNeedle")["data"]) > 0
api_error(lambda: client.search("other-user", "EcosystemNeedle"), 404, "not_found")

record = client.add(
    user_id=user, request_id="python-lifecycle", content="PythonLifecycleNeedle",
    source={"type": "manual", "ref": "ecosystem-python", "text": "PythonLifecycleNeedle",
            "observed_at": "2026-11-09T00:00:00Z"})
assert client.search(user, "PythonLifecycleNeedle")["data"][0]["id"] == record["id"]
updated = client.update(record["id"], content="Python changed",
                        source=record["source"], expected_version=record["version"], reason="Explicit test")
api_error(lambda: client.delete(record["id"], record["version"]), 409, "version_conflict")
assert len(client.history(record["id"])) == 2
client.delete(record["id"], updated["version"])
assert client.search(user, "PythonLifecycleNeedle")["data"] == []
api_error(lambda: client.get(record["id"]), 404, "not_found")

conversations = []
for index in range(51):
    row = client.create_conversation(
        user_id=user, request_id="py-conversation-" + str(index), title="Synthetic pagination",
        messages=[{"id": "m0", "role": "user", "content": "ConversationNeedle " + str(index),
                   "observed_at": "2026-11-09T00:00:00Z"}])
    conversations.append(row)
target = conversations[0]
for start in (1, 33):
    target = client.append_conversation(
        target["id"], request_id="append-" + str(start), expected_version=target["version"],
        messages=[{"id": "m" + str(index), "role": "user" if index % 2 else "assistant",
                   "content": "Message " + str(index), "observed_at": "2026-11-09T00:00:00Z"}
                  for index in range(start, start + 32)])
rows, conversation_sizes = pages(lambda cursor: client.conversations(user, cursor))
assert conversation_sizes == [50, 1]
assert {row["id"] for row in rows} == {row["id"] for row in conversations}
messages, message_sizes, cursor = [], [], ""
while True:
    page = client.conversation(target["id"], cursor)
    messages.extend(page["messages"])
    message_sizes.append(len(page["messages"]))
    cursor = page["next_cursor"]
    if cursor is None:
        break
assert message_sizes == [32, 32, 1]
assert [message["id"] for message in messages] == ["m" + str(i) for i in range(65)]
assert client.conversation_messages_all(target["id"]) == messages
assert len(client.conversations_all(user)) == 51

# Characterize current differences; these observations are NOT acceptance gates.
findings = {}
try:
    client.list(user, filter={"field": "category", "op": "eq", "value": "keep"})
except TypeError:
    findings["list_filter_supported"] = False
else:
    findings["list_filter_supported"] = True
try:
    client.export_page(user, filter={"field": "category", "op": "eq", "value": "keep"})
except TypeError:
    findings["export_filter_supported"] = False
else:
    findings["export_filter_supported"] = True
assert findings["list_filter_supported"] and findings["export_filter_supported"]
assert len(client.list(user, filter={"field": "category", "op": "eq", "value": "keep"})["data"]) == 26

slow = SixteenMemory(base + "/probe/slow", key, timeout=0.05)
started = time.monotonic()
try:
    slow.me()
except MemoryTransportError as error:
    findings["timeout_code"] = error.code
    findings["timeout_ms"] = round((time.monotonic() - started) * 1000)
else:
    raise AssertionError("slow response should time out")
for path in ("error", "invalid-code"):
    try:
        SixteenMemory(base + "/probe/" + path, key).me()
    except MemoryAPIError as error:
        findings[path] = {"code": error.code, "synthetic_message_exposed": "PRIVATE_SENTINEL" in str(error)}
    else:
        raise AssertionError("expected synthetic error")

async def block_probe():
    tick = asyncio.create_task(asyncio.sleep(0.01))
    try:
        slow.me()
    except MemoryTransportError:
        pass
    blocked = not tick.done()
    await tick
    return blocked

findings["native_async_export"] = hasattr(sixteen_memory, "AsyncSixteenMemory")
findings["coroutine_methods"] = [name for name, member in inspect.getmembers(SixteenMemory)
                                if inspect.iscoroutinefunction(member)]
findings["sync_call_blocks_event_loop"] = asyncio.run(block_probe())
findings["public_methods"] = [name for name, member in inspect.getmembers(SixteenMemory)
                              if not name.startswith("_") and callable(member)]
async def async_lifecycle():
    async with AsyncSixteenMemory(base, key, timeout=5) as c:
        assert len(await c.list_all(user)) == 51
        assert len(await c.export_all(user)) == 51
        assert len(await c.list_all(user, filter={"field": "category", "op": "eq", "value": "keep"})) == 26
        assert len(await c.conversations_all(user)) == 51
        assert len(await c.conversation_messages_all(target["id"])) == 65
        row = await c.add(user_id=user, request_id="async-lifecycle", content="AsyncNeedle",
                          source={"type": "manual", "ref": "async", "text": "AsyncNeedle",
                                  "observed_at": "2026-11-09T00:00:00Z"})
        try:
            assert (await c.search(user, "AsyncNeedle"))["data"][0]["id"] == row["id"]
            assert (await c.context(user, "AsyncNeedle"))["memories"][0]["id"] == row["id"]
        finally:
            await c.delete(row["id"], row["version"])
        assert (await c.search(user, "AsyncNeedle"))["data"] == []
    assert findings["timeout_code"] == "timeout"
    assert findings["native_async_export"]
    assert not findings["error"]["synthetic_message_exposed"]
    return True

findings["installed_native_async_lifecycle"] = asyncio.run(async_lifecycle())
print(json.dumps({
    "status": "behavioral_checks_passed_not_full_p1_acceptance",
    "python_version": __import__("sys").version.split()[0],
    "memory_ids": [row["id"] for row in memories], "memory_page_sizes": sizes,
    "export_page_sizes": export_sizes, "conversation_page_sizes": conversation_sizes,
    "message_page_sizes": message_sizes, "conversation_id": target["id"],
    "findings": findings,
}))

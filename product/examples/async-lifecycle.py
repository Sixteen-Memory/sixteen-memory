"""Native asyncio server example. Install the optional [async] extra first."""
import asyncio
import datetime
import os
import uuid
from sixteen_memory import AsyncSixteenMemory


async def main():
    async with AsyncSixteenMemory(os.environ["SIXTEEN_BASE_URL"], os.environ["SIXTEEN_API_KEY"]) as c:
        user = os.environ["SIXTEEN_USER_ID"]
        health = await c.health()
        assert health["model_configured"] is False and health["retrieval"] == "lexical"
        token = "AsyncLifecycle" + uuid.uuid4().hex
        now = datetime.datetime.now(datetime.timezone.utc)
        row = await c.add(user_id=user, request_id=str(uuid.uuid4()), content=token,
                          source={"type": "manual", "ref": "synthetic-lifecycle", "text": token, "observed_at": now.isoformat(timespec="milliseconds")},
                          expires_at=(now + datetime.timedelta(hours=1)).isoformat(timespec="milliseconds"))
        try:
            assert any(hit["id"] == row["id"] for hit in (await c.search(user, token))["data"])
        finally:
            await c.delete(row["id"], row["version"])
        assert (await c.search(user, token))["data"] == []
        print("PASS: async store -> retrieve -> delete -> no stale result")


asyncio.run(main())

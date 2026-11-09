"""Synchronous server example using only an explicitly configured synthetic scope."""
import datetime
import os
import uuid
from sixteen_memory import SixteenMemory

c = SixteenMemory(os.environ["SIXTEEN_BASE_URL"], os.environ["SIXTEEN_API_KEY"])
user = os.environ["SIXTEEN_USER_ID"]
health = c.health()
assert health["model_configured"] is False and health["retrieval"] == "lexical"
token = "Lifecycle" + uuid.uuid4().hex
now = datetime.datetime.now(datetime.timezone.utc)
row = c.add(user_id=user, request_id=str(uuid.uuid4()), content=token,
            source={"type": "manual", "ref": "synthetic-lifecycle", "text": token, "observed_at": now.isoformat(timespec="milliseconds")},
            expires_at=(now + datetime.timedelta(hours=1)).isoformat(timespec="milliseconds"))
try:
    assert any(hit["id"] == row["id"] for hit in c.search(user, token)["data"])
finally:
    c.delete(row["id"], row["version"])
assert c.search(user, token)["data"] == []
print("PASS: store -> retrieve -> delete -> no stale result")

"""Local clip -> model interpretation -> review job. Never approves automatically."""
import asyncio
import base64
import json
import os
from pathlib import Path
from sixteen_memory import AsyncSixteenMemory, SixteenMemory

if os.environ.get("SIXTEEN_MEDIA_CONSENT") != "yes":
    raise SystemExit("Set SIXTEEN_MEDIA_CONSENT=yes only for authorized media and approved model use.")
path = Path(os.environ["SIXTEEN_MEDIA_FILE"])
mime = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4"}.get(path.suffix.lower())
if not mime or path.stat().st_size > 2 * 1024 * 1024:
    raise SystemExit("Choose a WAV, MP3 or MP4 clip of at most 2 MiB.")
with path.open("rb") as media_file:
    raw = media_file.read(2 * 1024 * 1024 + 1)
if len(raw) > 2 * 1024 * 1024:
    raise SystemExit("Clip exceeds 2 MiB.")
data = dict(user_id=os.environ["SIXTEEN_USER_ID"], request_id=os.environ["SIXTEEN_REQUEST_ID"],
            ref="media-example", observed_at=os.environ["SIXTEEN_OBSERVED_AT"],
            media={"mime_type": mime, "data_base64": base64.b64encode(raw).decode("ascii")},
            consent=True, mode="review")

async def main():
    async with AsyncSixteenMemory(os.environ["SIXTEEN_BASE_URL"], os.environ["SIXTEEN_API_KEY"], timeout=90) as client:
        health = await client.health()
        if health.get("media_ingestion") != "assisted":
            raise SystemExit("The target service has no configured media provider.")
        return await client.ingest_media(**data)

if os.environ.get("SIXTEEN_ASYNC") == "yes":
    job = asyncio.run(main())
else:
    client = SixteenMemory(os.environ["SIXTEEN_BASE_URL"], os.environ["SIXTEEN_API_KEY"], timeout=90)
    if client.health().get("media_ingestion") != "assisted":
        raise SystemExit("The target service has no configured media provider.")
    job = client.ingest_media(**data)
print(json.dumps({"id": job["id"], "state": job["state"], "proposal": job["proposal"]}, ensure_ascii=False))

"""Explicitly authorized local media only; does not approve generated facts."""
import os
from pathlib import Path
from sixteen_memory import SixteenMemory
if os.environ.get("SIXTEEN_MEDIA_CONSENT") != "yes":
    raise SystemExit("Explicit consent required.")
path = os.environ["SIXTEEN_MEDIA_FILE"]
mime = {".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav"}[Path(path).suffix.lower()]
client = SixteenMemory(os.environ["SIXTEEN_BASE_URL"], os.environ["SIXTEEN_API_KEY"], timeout=120)
job = client.upload_media(path, user_id=os.environ["SIXTEEN_USER_ID"], request_id=os.environ["SIXTEEN_REQUEST_ID"],
    observed_at=os.environ["SIXTEEN_OBSERVED_AT"], ref="meeting-upload", mime_type=mime, consent=True)
print(job)
# Poll client.media_upload(job["id"]); then review its ingestion_id.

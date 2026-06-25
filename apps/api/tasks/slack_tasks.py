import uuid
import httpx

from .celery_app import celery_app
from ..config import settings
from ..database import SessionLocal
from ..models.project import Project
from ..models.asset import Asset, MediaFile
from ..services.s3_service import generate_presigned_get_url


def _thumbnail_url(version_id: str) -> str | None:
    """Return a short-lived presigned URL for the version thumbnail, or None."""
    try:
        db = SessionLocal()
        try:
            mf = db.query(MediaFile).filter(MediaFile.version_id == uuid.UUID(version_id)).first()
            if mf and mf.s3_key_thumbnail:
                return generate_presigned_get_url(mf.s3_key_thumbnail, expires_in=3600)
        finally:
            db.close()
    except Exception:
        pass
    return None


@celery_app.task(ignore_result=True)
def notify_slack(project_id: str, event_type: str, payload: dict):
    db = SessionLocal()
    try:
        project = db.query(Project).filter(
            Project.id == uuid.UUID(project_id),
            Project.deleted_at.is_(None),
        ).first()
        if not project or not project.slack_webhook_url:
            return

        thumbnail = None

        if event_type == "transcode_complete":
            asset = db.query(Asset).filter(Asset.id == uuid.UUID(payload["asset_id"])).first()
            asset_name = asset.name if asset else "an asset"
            asset_url = f"{settings.frontend_url}/projects/{project.id}/assets/{payload['asset_id']}"
            text = f":white_check_mark: New version of <{asset_url}|{asset_name}> is ready in *{project.name}*"
            if payload.get("version_id"):
                thumbnail = _thumbnail_url(payload["version_id"])
        elif event_type == "comment":
            asset_name = payload.get("asset_name", "an asset")
            author = payload.get("author", "Someone")
            body = payload.get("body", "")
            asset_id = payload.get("asset_id")
            if asset_id:
                asset_url = f"{settings.frontend_url}/projects/{project.id}/assets/{asset_id}"
                asset_link = f"<{asset_url}|{asset_name}>"
                asset_obj = db.query(Asset).filter(Asset.id == uuid.UUID(asset_id)).first()
                if asset_obj and asset_obj.versions:
                    latest = max(asset_obj.versions, key=lambda v: v.created_at)
                    thumbnail = _thumbnail_url(str(latest.id))
            else:
                asset_link = f"*{asset_name}*"
            text = f":speech_balloon: *{author}* commented on {asset_link} in *{project.name}*\n>{body}"
        else:
            return

        blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": text}}]
        if thumbnail and thumbnail.startswith("https://"):
            blocks.append({"type": "image", "image_url": thumbnail, "alt_text": "thumbnail"})

        httpx.post(project.slack_webhook_url, json={"blocks": blocks, "text": text}, timeout=5)
    except Exception:
        pass  # best-effort
    finally:
        db.close()

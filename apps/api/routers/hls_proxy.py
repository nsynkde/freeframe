"""HLS proxy for secure video streaming.

Rewrites m3u8 manifests so that:
- Variant playlist URLs go through this proxy (with token auth)
- Segment (.ts) URLs become presigned S3 URLs (direct to S3)

This eliminates the need for a public bucket policy on processed/*.
"""

import logging
import posixpath
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

from ..config import settings
from ..services.s3_service import generate_presigned_get_url, get_s3_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stream", tags=["streaming"])


def create_hls_token(s3_prefix: str, expires_hours: int = 24) -> str:
    """Create a short-lived JWT for HLS proxy access."""
    payload = {
        "sub": "hls",
        "pfx": s3_prefix,
        "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _verify_hls_token(token: str) -> str:
    """Verify HLS token and return s3_prefix."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("sub") != "hls":
            raise HTTPException(status_code=403, detail="Invalid token type")
        return payload["pfx"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _rewrite_manifest(content: str, s3_prefix: str, manifest_path: str, token: str) -> str:
    """Rewrite URLs in an m3u8 manifest.

    - .m3u8 references -> proxy URLs with token (appended as query param)
    - .ts references -> presigned S3 URLs
    """
    manifest_dir = posixpath.dirname(manifest_path)
    lines = content.split("\n")
    result = []

    for line in lines:
        stripped = line.strip()

        # Pass through comments/tags and empty lines
        if not stripped or stripped.startswith("#"):
            result.append(line)
            continue

        # Resolve segment/playlist path relative to current manifest directory
        if manifest_dir:
            relative_key = f"{manifest_dir}/{stripped}"
        else:
            relative_key = stripped

        if stripped.endswith(".m3u8"):
            # Variant playlist -> root-relative proxy URL
            result.append(f"/stream/hls/{relative_key}?token={token}")
        elif stripped.endswith(".ts"):
            # Root-relative so hls.js doesn't resolve it against the variant
            # playlist's subdirectory (which would double-prefix the path).
            result.append(f"/stream/hls/{relative_key}?token={token}")
        else:
            result.append(line)

    return "\n".join(result)


@router.get("/hls/{path:path}")
def hls_proxy(path: str, token: str = Query(...)):
    """Proxy HLS manifests and segments — keeps all video traffic on the same origin."""
    s3_prefix = _verify_hls_token(token)

    if not (path.endswith(".m3u8") or path.endswith(".ts")):
        raise HTTPException(status_code=400, detail="Only .m3u8 and .ts files are proxied")

    # Prevent directory traversal
    normalised = posixpath.normpath(path)
    if normalised.startswith("..") or normalised.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    s3_key = f"{s3_prefix}/{normalised}"
    if not s3_key.startswith(s3_prefix + "/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    s3 = get_s3_client()

    if path.endswith(".m3u8"):
        try:
            obj = s3.get_object(Bucket=settings.s3_bucket, Key=s3_key)
            content = obj["Body"].read().decode("utf-8")
        except Exception as e:
            logger.error("Failed to fetch HLS manifest %s: %s", s3_key, e)
            raise HTTPException(status_code=404, detail="Manifest not found")

        rewritten = _rewrite_manifest(content, s3_prefix, normalised, token)
        return Response(
            content=rewritten,
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-cache"},
        )

    # .ts segment — stream directly from S3
    try:
        obj = s3.get_object(Bucket=settings.s3_bucket, Key=s3_key)
    except Exception as e:
        logger.error("Failed to fetch HLS segment %s: %s", s3_key, e)
        raise HTTPException(status_code=404, detail="Segment not found")

    return StreamingResponse(
        obj["Body"],
        media_type="video/mp2t",
        headers={"Cache-Control": "max-age=86400"},
    )

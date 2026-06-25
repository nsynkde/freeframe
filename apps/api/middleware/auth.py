from datetime import datetime, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uuid
from typing import Optional
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.auth_service import decode_token, get_user_by_id
from ..models.user import User, UserStatus
from ..models.api_token import ApiToken, hash_token

bearer_scheme = HTTPBearer()
optional_bearer_scheme = HTTPBearer(auto_error=False)


def _resolve_token(token: str, db: Session) -> Optional[User]:
    """Resolve a bearer token to a User — supports both JWTs and ff_ API tokens."""
    if token.startswith("ff_"):
        row = db.query(ApiToken).filter(ApiToken.token_hash == hash_token(token)).first()
        if not row:
            return None
        if row.expires_at and row.expires_at < datetime.now(timezone.utc):
            return None
        # update last_used_at without blocking the request
        row.last_used_at = datetime.now(timezone.utc)
        db.commit()
        user = get_user_by_id(db, row.user_id)
    else:
        payload = decode_token(token)
        if not payload or payload.get("type") != "access":
            return None
        user = get_user_by_id(db, uuid.UUID(payload["sub"]))
    if not user or user.status == UserStatus.deactivated:
        return None
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    user = _resolve_token(credentials.credentials, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        return _resolve_token(credentials.credentials, db)
    except Exception:
        return None


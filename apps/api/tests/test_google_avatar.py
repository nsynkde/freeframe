import uuid
from unittest.mock import MagicMock, patch

from apps.api.routers.auth import _store_google_avatar
from apps.api.services.avatar_keys import is_own_avatar_key

PIC = "https://lh3.googleusercontent.com/a/abc=s96-c"


def _resp(content_type="image/jpeg", body=b"jpeg"):
    r = MagicMock(content=body, headers={"content-type": content_type})
    r.raise_for_status.return_value = None
    return r


def test_copies_the_picture_to_an_own_avatar_key():
    user_id = uuid.uuid4()
    with patch("apps.api.routers.auth.httpx.get", return_value=_resp()), \
         patch("apps.api.routers.auth.s3_service.put_object") as put:
        key = _store_google_avatar(user_id, PIC)
    assert is_own_avatar_key(user_id, key) and key.endswith(".jpg")
    put.assert_called_once_with(key, b"jpeg", content_type="image/jpeg")


def test_refuses_other_hosts_and_non_images():
    with patch("apps.api.routers.auth.httpx.get", return_value=_resp()) as get:
        assert _store_google_avatar(uuid.uuid4(), "https://evil.example/a.jpg") is None
        get.assert_not_called()
    with patch("apps.api.routers.auth.httpx.get", return_value=_resp("text/html")), \
         patch("apps.api.routers.auth.s3_service.put_object") as put:
        assert _store_google_avatar(uuid.uuid4(), PIC) is None
        put.assert_not_called()

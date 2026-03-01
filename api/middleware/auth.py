"""Authentication and authorization middleware for FastAPI.

Provides:
- Persistent JWT secret key (survives restarts)
- JWT token creation and verification
- get_current_user dependency (returns user dict or raises 401)
- require_permission(resource, action) dependency factory (raises 403)
"""

import contextlib
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from spiderfoot import SpiderFootHelpers

log = logging.getLogger(f"spiderfoot.{__name__}")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT configuration
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Bearer scheme (auto_error=False so we can provide better error messages)
bearer_scheme = HTTPBearer(auto_error=False)


def _get_or_create_jwt_key() -> str:
    """Get or create a persistent JWT signing key.

    Stored at {dataPath}/jwt.key so sessions survive restarts.
    """
    data_path = SpiderFootHelpers.dataPath()
    key_file = Path(data_path) / "jwt.key"

    if key_file.exists():
        return key_file.read_text().strip()

    key = os.urandom(32).hex()
    key_file.write_text(key)

    with contextlib.suppress(OSError):
        os.chmod(str(key_file), 0o600)

    log.info("Generated new persistent JWT signing key")
    return key


# Load once at module import time
SECRET_KEY = _get_or_create_jwt_key()


def create_access_token(user_id: str, username: str) -> str:
    """Create a JWT access token.

    Args:
        user_id: the user's database ID
        username: the user's username

    Returns:
        Encoded JWT string
    """
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode = {"sub": user_id, "username": username, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Verify a JWT token and return the payload.

    Returns:
        dict with 'sub' (user_id) and 'username', or None on failure
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        username = payload.get("username")
        if not user_id or not username:
            return None
        return {"user_id": user_id, "username": username}
    except JWTError:
        return None


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Dependency: extract and validate the current user from JWT.

    Returns:
        dict: {id, username, display_name, email, roles, permissions}

    Raises:
        HTTPException 401: missing/invalid/expired token or disabled user
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Load full user from database
    from api.dependencies import get_db
    dbh = get_db(request)

    user_row = dbh.userGet(payload["user_id"])
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # row: (id, username, password, display_name, email, is_active, created, updated)
    if not user_row[5]:  # is_active
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )

    roles = dbh.userRolesGet(user_row[0])
    permissions = dbh.userPermissionsGet(user_row[0])

    return {
        "id": user_row[0],
        "username": user_row[1],
        "display_name": user_row[3],
        "email": user_row[4],
        "roles": roles,
        "permissions": [f"{p[0]}:{p[1]}" for p in permissions],
    }


def require_permission(resource: str, action: str):
    """Factory: return a dependency that checks a specific permission.

    Administrators bypass all permission checks.

    Usage:
        @router.get("/things", dependencies=[Depends(require_permission("things", "read"))])
        def list_things(...):
            ...

    Or to also get the user dict:
        def list_things(user: dict = Depends(require_permission("things", "read"))):
            ...
    """
    def _check_permission(user: dict = Depends(get_current_user)) -> dict:
        # Admin bypass
        if "administrator" in user["roles"]:
            return user

        required = f"{resource}:{action}"
        if required not in user["permissions"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions: {required}",
            )
        return user

    return _check_permission

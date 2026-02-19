"""Authentication API routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.dependencies import get_db
from api.middleware.auth import (
    create_access_token,
    get_current_user,
    pwd_context,
)
from api.models.auth import ChangePasswordRequest, LoginRequest, LoginResponse, UserInfo
from spiderfoot import SpiderFootDb

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    request: Request,
    dbh: SpiderFootDb = Depends(get_db),
) -> LoginResponse:
    """Authenticate with username/password, returns JWT + user info."""
    user_row = dbh.userGetByUsername(body.username)

    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # row: (id, username, password, display_name, email, is_active, created, updated)
    if not user_row[5]:  # is_active
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
        )

    if not pwd_context.verify(body.password, user_row[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Build user info
    roles = dbh.userRolesGet(user_row[0])
    permissions = dbh.userPermissionsGet(user_row[0])

    token = create_access_token(user_row[0], user_row[1])

    user_info = UserInfo(
        id=user_row[0],
        username=user_row[1],
        display_name=user_row[3],
        email=user_row[4],
        roles=roles,
        permissions=[f"{p[0]}:{p[1]}" for p in permissions],
    )

    # Audit log
    ip = request.client.host if request.client else ""
    dbh.auditLogCreate(user_row[0], user_row[1], "login", "auth", ip_address=ip)

    log.info(f"User '{user_row[1]}' logged in from {ip}")

    return LoginResponse(token=token, user=user_info)


@router.post("/logout")
def logout(
    request: Request,
    user: dict = Depends(get_current_user),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Log out (server-side audit only; client discards token)."""
    ip = request.client.host if request.client else ""
    dbh.auditLogCreate(user["id"], user["username"], "logout", "auth", ip_address=ip)
    return ["SUCCESS", "Logged out"]


@router.get("/me", response_model=UserInfo)
def get_me(user: dict = Depends(get_current_user)) -> UserInfo:
    """Get the current authenticated user's info."""
    return UserInfo(**user)


@router.put("/change-password")
def change_password(
    body: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Change the current user's password."""
    # Verify current password
    user_row = dbh.userGet(user["id"])
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    if not pwd_context.verify(body.current_password, user_row[2]):
        return ["ERROR", "Current password is incorrect"]

    # Hash and save new password
    new_hash = pwd_context.hash(body.new_password)
    dbh.userSetPassword(user["id"], new_hash)

    log.info(f"User '{user['username']}' changed their password")
    return ["SUCCESS", "Password changed successfully"]

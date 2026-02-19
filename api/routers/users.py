"""User management API routes (admin only)."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_db
from api.middleware.auth import pwd_context, require_permission
from api.models.users import AdminPasswordReset, UserCreate, UserResponse, UserUpdate
from spiderfoot import SpiderFootDb

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(tags=["users"])


def _user_to_response(dbh: SpiderFootDb, row: tuple) -> UserResponse:
    """Convert a DB user row to a UserResponse."""
    roles = dbh.userRolesGet(row[0])
    return UserResponse(
        id=row[0],
        username=row[1],
        display_name=row[3],
        email=row[4],
        is_active=bool(row[5]),
        roles=roles,
        created=row[6],
        updated=row[7],
    )


@router.get("/users")
def list_users(
    user: dict = Depends(require_permission("users", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """List all users."""
    rows = dbh.userList()
    return [_user_to_response(dbh, row) for row in rows]


@router.post("/users")
def create_user(
    body: UserCreate,
    user: dict = Depends(require_permission("users", "create")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Create a new user."""
    # Check username uniqueness
    existing = dbh.userGetByUsername(body.username)
    if existing:
        return ["ERROR", f"Username '{body.username}' already exists"]

    password_hash = pwd_context.hash(body.password)
    user_id = dbh.userCreate(body.username, password_hash, body.display_name, body.email)

    if body.role_ids:
        dbh.userRolesSet(user_id, body.role_ids)

    new_row = dbh.userGet(user_id)
    log.info(f"User '{body.username}' created by '{user['username']}'")
    return ["SUCCESS", _user_to_response(dbh, new_row)]


@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    user: dict = Depends(require_permission("users", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> UserResponse:
    """Get a single user."""
    row = dbh.userGet(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_response(dbh, row)


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    body: UserUpdate,
    user: dict = Depends(require_permission("users", "update")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Update a user's profile and/or roles."""
    row = dbh.userGet(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Safeguard: cannot deactivate self
    if body.is_active is False and user_id == user["id"]:
        return ["ERROR", "Cannot deactivate your own account"]

    # Safeguard: cannot remove admin role from last admin
    if body.role_ids is not None:
        current_roles = dbh.userRolesGet(user_id)
        admin_role_id = dbh.roleGetByName("administrator")
        if "administrator" in current_roles and admin_role_id not in body.role_ids:
            # Check if this is the last admin
            all_users = dbh.userList()
            admin_count = 0
            for u in all_users:
                if u[5]:  # is_active
                    u_roles = dbh.userRolesGet(u[0])
                    if "administrator" in u_roles:
                        admin_count += 1
            if admin_count <= 1:
                return ["ERROR", "Cannot remove administrator role from the last admin user"]

    # Apply field updates
    fields = {}
    if body.display_name is not None:
        fields["display_name"] = body.display_name
    if body.email is not None:
        fields["email"] = body.email
    if body.is_active is not None:
        fields["is_active"] = 1 if body.is_active else 0

    if fields:
        dbh.userUpdate(user_id, **fields)

    if body.role_ids is not None:
        dbh.userRolesSet(user_id, body.role_ids)

    updated_row = dbh.userGet(user_id)
    return ["SUCCESS", _user_to_response(dbh, updated_row)]


@router.put("/users/{user_id}/password")
def reset_user_password(
    user_id: str,
    body: AdminPasswordReset,
    user: dict = Depends(require_permission("users", "update")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Admin resets a user's password."""
    row = dbh.userGet(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    new_hash = pwd_context.hash(body.new_password)
    dbh.userSetPassword(user_id, new_hash)

    log.info(f"Password reset for user '{row[1]}' by admin '{user['username']}'")
    return ["SUCCESS", "Password reset successfully"]


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    user: dict = Depends(require_permission("users", "delete")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Soft-delete a user (set is_active=0)."""
    row = dbh.userGet(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Cannot delete self
    if user_id == user["id"]:
        return ["ERROR", "Cannot delete your own account"]

    # Cannot delete last admin
    current_roles = dbh.userRolesGet(user_id)
    if "administrator" in current_roles:
        all_users = dbh.userList()
        admin_count = sum(
            1 for u in all_users
            if u[5] and "administrator" in dbh.userRolesGet(u[0])
        )
        if admin_count <= 1:
            return ["ERROR", "Cannot delete the last administrator"]

    dbh.userSetActive(user_id, False)
    log.info(f"User '{row[1]}' deactivated by '{user['username']}'")
    return ["SUCCESS", "User deactivated"]


@router.get("/roles")
def list_roles(
    user: dict = Depends(require_permission("users", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """List all available roles."""
    rows = dbh.roleList()
    return [{"id": r[0], "name": r[1], "description": r[2]} for r in rows]

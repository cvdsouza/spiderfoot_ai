"""Pydantic models for user management endpoints."""

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_.-]+$')
    password: str = Field(..., min_length=8, max_length=200)
    display_name: str = Field("", max_length=100)
    email: str = Field("", max_length=200)
    role_ids: list[str] = Field(default_factory=list)


class UserUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    is_active: bool | None = None
    role_ids: list[str] | None = None


class AdminPasswordReset(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=200)


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    email: str
    is_active: bool
    roles: list[str]
    created: int
    updated: int

"""Pydantic models for authentication endpoints."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class UserInfo(BaseModel):
    id: str
    username: str
    display_name: str
    email: str
    roles: list[str]
    permissions: list[str]


class LoginResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: UserInfo


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=200)

"""Pydantic models for settings API endpoints."""

from typing import Any

from pydantic import BaseModel


class SettingsData(BaseModel):
    """Settings response data."""
    data: dict[str, Any]


class SettingsUpdate(BaseModel):
    """Settings update request body."""
    allopts: dict[str, Any]


class ModuleInfo(BaseModel):
    """Module information."""
    name: str
    descr: str


class EventTypeInfo(BaseModel):
    """Event type information."""
    name: str
    id: str


class CorrelationRuleInfo(BaseModel):
    """Correlation rule information."""
    id: str
    name: str
    descr: str
    risk: str

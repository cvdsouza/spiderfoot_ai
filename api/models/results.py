"""Pydantic models for scan result/event API endpoints."""

from typing import Any

from pydantic import BaseModel


class EventResult(BaseModel):
    """A single event result from a scan."""
    last_seen: str
    data: str
    source_data: str
    module: str
    type: str
    confidence: int
    visibility: int
    risk: int
    false_positive: int
    source_event_hash: str
    event_type: str


class UniqueEventResult(BaseModel):
    """A unique event result with occurrence count."""
    data: str
    count: int
    unique_data: str


class CorrelationResult(BaseModel):
    """A single correlation result."""
    id: str
    title: str
    rule_name: str
    rule_risk: str
    rule_id: str
    rule_description: str
    rule_logic: str
    event_count: int


class SearchCriteria(BaseModel):
    """Search criteria for filtering results."""
    scan_id: str | None = None
    event_type: str | None = None
    value: str | None = None


class ElementTypeDiscovery(BaseModel):
    """Element type discovery tree response."""
    tree: Any
    data: Any

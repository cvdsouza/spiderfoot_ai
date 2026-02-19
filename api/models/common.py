"""Common Pydantic models for API responses."""

from typing import Any

from pydantic import BaseModel


class ErrorDetail(BaseModel):
    """Error detail model."""
    http_status: int
    message: str


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: ErrorDetail


class StatusResponse(BaseModel):
    """Simple status + data response used by many endpoints."""
    status: str  # "SUCCESS" or "ERROR" or "WARNING"
    data: Any = None
    message: str = ""

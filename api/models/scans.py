"""Pydantic models for scan-related API endpoints."""

from enum import Enum
from typing import Any

from pydantic import BaseModel


class ScanStatusEnum(str, Enum):
    """Possible scan states."""
    INITIALIZING = "INITIALIZING"
    STARTING = "STARTING"
    STARTED = "STARTED"
    RUNNING = "RUNNING"
    ABORT_REQUESTED = "ABORT-REQUESTED"
    ABORTED = "ABORTED"
    FINISHED = "FINISHED"
    ERROR_FAILED = "ERROR-FAILED"


class ScanCreate(BaseModel):
    """Request body for creating a new scan."""
    scan_name: str
    scan_target: str
    module_list: str = ""
    type_list: str = ""
    use_case: str = ""


class ScanListItem(BaseModel):
    """A scan in the scan list."""
    id: str
    name: str
    target: str
    created: str
    started: str
    finished: str
    status: str
    num_elements: int
    risk_matrix: dict[str, int]


class ScanStatusInfo(BaseModel):
    """Scan status response."""
    name: str
    target: str
    created: str
    started: str
    finished: str
    status: str
    risk_matrix: dict[str, int]


class ScanConfig(BaseModel):
    """Scan configuration response."""
    meta: list[Any]
    config: dict[str, Any]
    configdesc: dict[str, str]


class ScanLogEntry(BaseModel):
    """A single scan log entry."""
    generated: str
    component: str
    type: str
    message: str
    row_id: int | None = None


class ScanErrorEntry(BaseModel):
    """A single scan error entry."""
    generated: str
    component: str
    message: str

"""Pydantic models for AI analysis endpoints."""

from pydantic import BaseModel


class AiConfigUpdate(BaseModel):
    """Request body for saving AI configuration."""
    provider: str = ""
    openai_key: str = ""
    anthropic_key: str = ""
    default_mode: str = "quick"


class AiAnalysisRequest(BaseModel):
    """Request body for triggering AI analysis."""
    provider: str = ""  # empty = use configured default
    mode: str = ""      # empty = use configured default


class AiChatRequest(BaseModel):
    """Request body for sending a natural language query."""
    question: str

"""Pydantic models for correlation rules API endpoints."""

from pydantic import BaseModel


class CorrelationRuleCreate(BaseModel):
    """Request body for creating a new correlation rule."""
    rule_id: str
    yaml_content: str


class CorrelationRuleUpdate(BaseModel):
    """Request body for updating a correlation rule."""
    yaml_content: str


class CorrelationRuleValidate(BaseModel):
    """Request body for validating correlation rule YAML."""
    yaml_content: str


class AiRuleGenerateRequest(BaseModel):
    """Request body for AI-assisted rule generation."""
    prompt: str
    existing_yaml: str | None = None

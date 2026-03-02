"""AI analysis API routes."""

import contextlib
import json
import time
import logging

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_config, get_db
from api.middleware.auth import require_permission
from api.models.ai_analysis import AiAnalysisRequest, AiChatRequest, AiConfigUpdate
from api.services.encryption import encrypt_api_key
from api.services.ai_analysis import run_analysis_background, test_api_key
from api.services.ai_query import run_nlq
from spiderfoot import SpiderFootDb

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(tags=["ai-analysis"])


# ── AI Configuration ──────────────────────────────────────────────────────


@router.get("/ai/config")
def get_ai_config(user: dict = Depends(require_permission("ai_features", "read")), config: dict = Depends(get_config)) -> list:
    """Get AI configuration status (no secrets returned)."""
    return ["SUCCESS", {
        "provider": config.get("_ai_provider", "openai"),
        "openai_key_set": bool(config.get("_ai_openai_key", "")),
        "anthropic_key_set": bool(config.get("_ai_anthropic_key", "")),
        "default_mode": config.get("_ai_default_mode", "quick"),
    }]


@router.put("/ai/config")
def save_ai_config(
    body: AiConfigUpdate,
    user: dict = Depends(require_permission("settings", "update")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Save AI configuration (encrypts API keys before storing)."""
    try:
        opts = {}

        if body.provider:
            config["_ai_provider"] = body.provider
            opts["GLOBAL:_ai_provider"] = body.provider

        if body.default_mode:
            config["_ai_default_mode"] = body.default_mode
            opts["GLOBAL:_ai_default_mode"] = body.default_mode

        if body.openai_key:
            encrypted = encrypt_api_key(body.openai_key)
            config["_ai_openai_key"] = encrypted
            opts["GLOBAL:_ai_openai_key"] = encrypted

        if body.anthropic_key:
            encrypted = encrypt_api_key(body.anthropic_key)
            config["_ai_anthropic_key"] = encrypted
            opts["GLOBAL:_ai_anthropic_key"] = encrypted

        if opts:
            dbh.configSet(opts)

        return ["SUCCESS", "AI configuration saved"]
    except Exception as e:
        log.error(f"Failed to save AI config: {e}")
        return ["ERROR", f"Failed to save AI configuration: {e}"]


@router.post("/ai/config/test")
def test_ai_connection(
    body: dict,
    user: dict = Depends(require_permission("settings", "update")),
) -> list:
    """Test an API key by making a minimal API call."""
    provider = body.get("provider", "")
    api_key = body.get("api_key", "")

    if not provider or not api_key:
        return ["ERROR", "Provider and API key are required"]

    result = test_api_key(provider, api_key)
    if result["success"]:
        return ["SUCCESS", result["message"]]
    return ["ERROR", result["message"]]


# ── Scan AI Analysis ──────────────────────────────────────────────────────


@router.post("/scans/{scan_id}/ai-analysis")
def trigger_analysis(
    scan_id: str,
    body: AiAnalysisRequest,
    user: dict = Depends(require_permission("ai_features", "create")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Trigger AI analysis of a completed scan.

    Returns immediately with the analysis ID. The analysis runs in a background thread.
    Poll GET /scans/{scan_id}/ai-analysis to check status.
    """
    # Validate scan exists and is in a terminal state
    scan_info = dbh.scanInstanceGet(scan_id)
    if not scan_info:
        raise HTTPException(status_code=404, detail="Scan not found")

    status = scan_info[5]
    if status not in ("FINISHED", "ABORTED", "ERROR-FAILED"):
        return ["ERROR", f"Scan is still {status}. Wait for it to complete before analyzing."]

    # Determine provider and mode
    provider = body.provider or config.get("_ai_provider", "openai")
    mode = body.mode or config.get("_ai_default_mode", "quick")

    if provider not in ("openai", "anthropic"):
        return ["ERROR", f"Unsupported provider: {provider}"]
    if mode not in ("quick", "deep"):
        return ["ERROR", f"Unsupported mode: {mode}"]

    # Check API key is configured
    key_opt = f"_ai_{provider}_key"
    if not config.get(key_opt, ""):
        return ["ERROR", f"No API key configured for {provider}. Go to Settings to configure."]

    # Launch background analysis
    analysis_id = run_analysis_background(config, scan_id, provider, mode)

    return ["SUCCESS", {
        "analysis_id": analysis_id,
        "status": "running",
        "provider": provider,
        "mode": mode,
    }]


@router.get("/scans/{scan_id}/ai-analysis")
def list_analyses(
    scan_id: str,
    user: dict = Depends(require_permission("ai_features", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Get all AI analyses for a scan."""
    rows = dbh.aiAnalysisGet(scan_id)

    analyses = []
    for row in rows:
        # row: [id, scan_instance_id, provider, model, mode, created, status, result_json, token_usage, error]
        result = None
        if row[7]:
            try:
                result = json.loads(row[7])
            except (json.JSONDecodeError, TypeError):
                result = None

        analyses.append({
            "id": row[0],
            "scan_instance_id": row[1],
            "provider": row[2],
            "model": row[3],
            "mode": row[4],
            "created": row[5],
            "status": row[6],
            "result": result,
            "token_usage": row[8],
            "error": row[9],
        })

    return analyses


@router.get("/scans/{scan_id}/ai-analysis/{analysis_id}")
def get_analysis(
    scan_id: str,
    analysis_id: str,
    user: dict = Depends(require_permission("ai_features", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Get a specific AI analysis."""
    row = dbh.aiAnalysisGetById(analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")

    result = None
    if row[7]:
        try:
            result = json.loads(row[7])
        except (json.JSONDecodeError, TypeError):
            result = None

    return {
        "id": row[0],
        "scan_instance_id": row[1],
        "provider": row[2],
        "model": row[3],
        "mode": row[4],
        "created": row[5],
        "status": row[6],
        "result": result,
        "token_usage": row[8],
        "error": row[9],
    }


@router.delete("/scans/{scan_id}/ai-analysis/{analysis_id}")
def delete_analysis(
    scan_id: str,
    analysis_id: str,
    user: dict = Depends(require_permission("ai_features", "create")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Delete an AI analysis."""
    row = dbh.aiAnalysisGetById(analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")

    dbh.aiAnalysisDelete(analysis_id)
    return ["SUCCESS", "Analysis deleted"]


# ── Scan AI Chat (Natural Language Query) ────────────────────────────────


@router.post("/scans/{scan_id}/ai-chat")
def send_chat_message(
    scan_id: str,
    body: AiChatRequest,
    user: dict = Depends(require_permission("ai_features", "create")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Send a natural language question about scan data.

    Synchronous endpoint — blocks until the LLM responds (typically 5-15s).
    The question and answer are persisted in chat history.
    """
    # Validate scan exists
    scan_info = dbh.scanInstanceGet(scan_id)
    if not scan_info:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Validate question
    question = body.question.strip()
    if not question:
        return ["ERROR", "Question cannot be empty"]
    if len(question) > 2000:
        return ["ERROR", "Question is too long (max 2000 characters)"]

    # Guard against rapid-fire abuse: check if last message was within 2 seconds
    chat_rows = dbh.aiChatGet(scan_id)
    if chat_rows:
        last_msg_time = chat_rows[-1][5]  # created timestamp (ms)
        if (int(time.time() * 1000) - last_msg_time) < 2000:
            return ["ERROR", "Please wait a moment before sending another question"]

    # Check API key is configured
    provider = config.get("_ai_provider", "openai")
    key_opt = f"_ai_{provider}_key"
    if not config.get(key_opt, ""):
        return ["ERROR", f"No API key configured for {provider}"]

    # Build chat history for LLM context (only user + assistant messages)
    # chat_rows already loaded above for rate-limit check
    chat_history = []
    for row in chat_rows:
        # row: [id, scan_instance_id, role, content, token_usage, created]
        if row[2] in ("user", "assistant"):
            chat_history.append({"role": row[2], "content": row[3]})

    # Limit context: keep last 20 messages (10 exchanges)
    max_context = 20
    if len(chat_history) > max_context:
        chat_history = chat_history[-max_context:]

    # Save user message
    dbh.aiChatCreate(scan_id, "user", question)

    try:
        result = run_nlq(config, scan_id, question, chat_history)

        # Save tool call records for auditability
        if result["tool_calls_made"]:
            dbh.aiChatCreate(
                scan_id, "tool_call",
                json.dumps({"tool_calls": result["tool_calls_made"]})
            )

        # Save assistant response
        msg_id = dbh.aiChatCreate(
            scan_id, "assistant", result["answer"],
            tokenUsage=result["token_usage"]
        )

        return ["SUCCESS", {
            "message_id": msg_id,
            "answer": result["answer"],
            "tool_calls_made": result["tool_calls_made"],
            "token_usage": result["token_usage"],
        }]

    except ValueError as e:
        # ValueError is raised for known config issues (no API key, bad provider)
        log.warning(f"AI chat config issue for scan {scan_id}: {e}")
        error_msg = str(e)
        dbh.aiChatCreate(scan_id, "assistant", f"Configuration issue: {error_msg}")
        return ["ERROR", error_msg]
    except Exception as e:
        # Log full error internally but return a safe generic message
        log.error(f"AI chat error for scan {scan_id}: {e}", exc_info=True)
        dbh.aiChatCreate(scan_id, "assistant",
                         "Sorry, I encountered an error processing your question. Please try again.")
        return ["ERROR", "AI query failed. Please try again or check your AI provider configuration."]


@router.get("/scans/{scan_id}/ai-chat")
def get_chat_history(
    scan_id: str,
    user: dict = Depends(require_permission("ai_features", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Get the full chat history for a scan."""
    rows = dbh.aiChatGet(scan_id)
    messages = []
    for row in rows:
        msg = {
            "id": row[0],
            "role": row[2],
            "content": row[3],
            "token_usage": row[4],
            "created": row[5],
        }
        # Parse JSON content for tool_call and tool_result roles
        if row[2] in ("tool_call", "tool_result"):
            with contextlib.suppress(json.JSONDecodeError, TypeError):
                msg["content"] = json.loads(row[3])
        messages.append(msg)

    return messages


@router.delete("/scans/{scan_id}/ai-chat")
def clear_chat_history(
    scan_id: str,
    user: dict = Depends(require_permission("ai_features", "create")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Delete all chat history for a scan."""
    dbh.aiChatDeleteAll(scan_id)
    return ["SUCCESS", "Chat history cleared"]

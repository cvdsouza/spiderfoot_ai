"""Correlation rules management API routes."""

import logging

import yaml
from fastapi import APIRouter, Depends, HTTPException, Request

from api.dependencies import get_config, get_db
from api.middleware.auth import require_permission
from api.models.correlation_rules import (
    AiRuleGenerateRequest,
    CorrelationRuleCreate,
    CorrelationRuleUpdate,
    CorrelationRuleValidate,
)
from spiderfoot import SpiderFootCorrelator, SpiderFootDb

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(tags=["correlation-rules"])


# ── List / Get ───────────────────────────────────────────────────────────


@router.get("/correlation-rules")
def list_correlation_rules(user: dict = Depends(require_permission("correlation_rules", "read")), config: dict = Depends(get_config), dbh: SpiderFootDb = Depends(get_db)) -> list:
    """List all correlation rules (built-in + user-defined)."""
    retdata = []
    rules = config.get('__correlationrules__', [])

    for rule in rules:
        retdata.append({
            'rule_id': rule.get('id', ''),
            'name': rule.get('meta', {}).get('name', ''),
            'description': rule.get('meta', {}).get('description', ''),
            'risk': rule.get('meta', {}).get('risk', ''),
            'source': rule.get('_source', 'builtin'),
            'enabled': True,
        })

    # Also include disabled user rules from DB
    try:
        user_rows = dbh.correlationRuleGetAll()
        active_user_ids = {r['rule_id'] for r in retdata if r['source'] == 'user'}
        for row in user_rows:
            rule_id = row[1]
            if rule_id not in active_user_ids:
                # This is a disabled user rule
                try:
                    parsed = yaml.safe_load(row[2])
                except Exception:
                    parsed = {}
                retdata.append({
                    'rule_id': rule_id,
                    'name': parsed.get('meta', {}).get('name', rule_id) if isinstance(parsed, dict) else rule_id,
                    'description': parsed.get('meta', {}).get('description', '') if isinstance(parsed, dict) else '',
                    'risk': parsed.get('meta', {}).get('risk', 'INFO') if isinstance(parsed, dict) else 'INFO',
                    'source': 'user',
                    'enabled': False,
                })
    except Exception as e:
        log.warning(f"Failed to load disabled user rules: {e}")

    return retdata


@router.get("/correlation-rules/{rule_id}")
def get_correlation_rule(
    rule_id: str,
    user: dict = Depends(require_permission("correlation_rules", "read")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> dict:
    """Get a single correlation rule with full YAML content."""
    # Check active (parsed) rules first
    rules = config.get('__correlationrules__', [])
    for rule in rules:
        if rule.get('id') == rule_id:
            return {
                'rule_id': rule.get('id', ''),
                'name': rule.get('meta', {}).get('name', ''),
                'description': rule.get('meta', {}).get('description', ''),
                'risk': rule.get('meta', {}).get('risk', ''),
                'source': rule.get('_source', 'builtin'),
                'enabled': True,
                'yaml_content': rule.get('rawYaml', ''),
            }

    # Check disabled user rules in DB
    row = dbh.correlationRuleGet(rule_id)
    if row:
        return {
            'rule_id': row[1],
            'name': rule_id,
            'description': '',
            'risk': 'INFO',
            'source': 'user',
            'enabled': bool(row[3]),
            'yaml_content': row[2],
        }

    raise HTTPException(status_code=404, detail="Rule not found")


# ── Create / Update / Delete ─────────────────────────────────────────────


@router.post("/correlation-rules")
def create_correlation_rule(
    body: CorrelationRuleCreate,
    request: Request,
    user: dict = Depends(require_permission("correlation_rules", "create")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Create a new user-defined correlation rule."""
    # Validate YAML parses
    try:
        parsed = yaml.safe_load(body.yaml_content)
    except yaml.YAMLError as e:
        return ["ERROR", f"Invalid YAML: {e}"]

    if not isinstance(parsed, dict):
        return ["ERROR", "YAML must parse to a dictionary"]

    # Ensure rule_id matches YAML id field
    yaml_id = parsed.get('id', '')
    if yaml_id != body.rule_id:
        return ["ERROR", f"rule_id '{body.rule_id}' does not match YAML id field '{yaml_id}'"]

    # Check for conflict with built-in rules
    builtin_ids = {r.get('id') for r in config.get('__correlationrules__', []) if r.get('_source') == 'builtin'}
    if body.rule_id in builtin_ids:
        return ["ERROR", f"Rule ID '{body.rule_id}' conflicts with a built-in rule"]

    # Check for existing user rule with same ID
    existing = dbh.correlationRuleGet(body.rule_id)
    if existing:
        return ["ERROR", f"A user rule with ID '{body.rule_id}' already exists"]

    # Validate via SpiderFootCorrelator
    validation = _validate_yaml(body.yaml_content, config, dbh)
    if not validation['valid']:
        return ["ERROR", f"Rule validation failed: {validation['error']}"]

    # Save to DB
    try:
        dbh.correlationRuleCreate(body.rule_id, body.yaml_content)
    except Exception as e:
        log.error(f"Failed to save correlation rule: {e}")
        return ["ERROR", "Failed to save rule to database"]

    # Reload rules
    from api.app import reload_correlation_rules
    reload_correlation_rules(request.app)

    return ["SUCCESS", "Correlation rule created"]


@router.put("/correlation-rules/{rule_id}")
def update_correlation_rule(
    rule_id: str,
    body: CorrelationRuleUpdate,
    request: Request,
    user: dict = Depends(require_permission("correlation_rules", "update")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Update a user-defined correlation rule."""
    # Reject built-in rules
    builtin_ids = {r.get('id') for r in config.get('__correlationrules__', []) if r.get('_source') == 'builtin'}
    if rule_id in builtin_ids:
        raise HTTPException(status_code=403, detail="Cannot modify built-in rules")

    # Check rule exists in DB
    existing = dbh.correlationRuleGet(rule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="User rule not found")

    # Validate YAML
    try:
        parsed = yaml.safe_load(body.yaml_content)
    except yaml.YAMLError as e:
        return ["ERROR", f"Invalid YAML: {e}"]

    if not isinstance(parsed, dict):
        return ["ERROR", "YAML must parse to a dictionary"]

    # Ensure YAML id field matches the rule_id
    yaml_id = parsed.get('id', '')
    if yaml_id != rule_id:
        return ["ERROR", f"YAML id field '{yaml_id}' does not match rule_id '{rule_id}'"]

    # Validate via SpiderFootCorrelator
    validation = _validate_yaml(body.yaml_content, config, dbh)
    if not validation['valid']:
        return ["ERROR", f"Rule validation failed: {validation['error']}"]

    # Update in DB
    try:
        dbh.correlationRuleUpdate(rule_id, body.yaml_content)
    except Exception as e:
        log.error(f"Failed to update correlation rule: {e}")
        return ["ERROR", "Failed to update rule in database"]

    # Reload rules
    from api.app import reload_correlation_rules
    reload_correlation_rules(request.app)

    return ["SUCCESS", "Correlation rule updated"]


@router.delete("/correlation-rules/{rule_id}")
def delete_correlation_rule(
    rule_id: str,
    request: Request,
    user: dict = Depends(require_permission("correlation_rules", "delete")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Delete a user-defined correlation rule."""
    # Reject built-in rules
    builtin_ids = {r.get('id') for r in config.get('__correlationrules__', []) if r.get('_source') == 'builtin'}
    if rule_id in builtin_ids:
        raise HTTPException(status_code=403, detail="Cannot delete built-in rules")

    # Check rule exists
    existing = dbh.correlationRuleGet(rule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="User rule not found")

    try:
        dbh.correlationRuleDelete(rule_id)
    except Exception as e:
        log.error(f"Failed to delete correlation rule: {e}")
        return ["ERROR", "Failed to delete rule from database"]

    # Reload rules
    from api.app import reload_correlation_rules
    reload_correlation_rules(request.app)

    return ["SUCCESS", "Correlation rule deleted"]


@router.post("/correlation-rules/{rule_id}/toggle")
def toggle_correlation_rule(
    rule_id: str,
    request: Request,
    user: dict = Depends(require_permission("correlation_rules", "update")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Enable or disable a user-defined correlation rule."""
    # Reject built-in rules
    builtin_ids = {r.get('id') for r in config.get('__correlationrules__', []) if r.get('_source') == 'builtin'}
    if rule_id in builtin_ids:
        raise HTTPException(status_code=403, detail="Cannot toggle built-in rules")

    # Check rule exists
    existing = dbh.correlationRuleGet(rule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="User rule not found")

    # Toggle: if currently enabled, disable; if disabled, enable
    current_enabled = bool(existing[3])
    new_enabled = not current_enabled

    try:
        dbh.correlationRuleToggle(rule_id, new_enabled)
    except Exception as e:
        log.error(f"Failed to toggle correlation rule: {e}")
        return ["ERROR", "Failed to toggle rule"]

    # Reload rules
    from api.app import reload_correlation_rules
    reload_correlation_rules(request.app)

    return ["SUCCESS", {"enabled": new_enabled}]


# ── Validation ───────────────────────────────────────────────────────────


@router.post("/correlation-rules/validate")
def validate_correlation_rule(
    body: CorrelationRuleValidate,
    user: dict = Depends(require_permission("correlation_rules", "create")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Validate correlation rule YAML without saving."""
    result = _validate_yaml(body.yaml_content, config, dbh)
    if result['valid']:
        return ["SUCCESS", "Rule YAML is valid"]
    return ["ERROR", result['error']]


def _validate_yaml(yaml_content: str, config: dict, dbh: SpiderFootDb) -> dict:
    """Validate YAML by attempting to parse it through SpiderFootCorrelator.

    Returns:
        dict with 'valid' (bool) and 'error' (str or None)
    """
    try:
        parsed = yaml.safe_load(yaml_content)
    except yaml.YAMLError as e:
        return {'valid': False, 'error': f"Invalid YAML syntax: {e}"}

    if not isinstance(parsed, dict):
        return {'valid': False, 'error': "YAML must parse to a dictionary"}

    rule_id = parsed.get('id')
    if not rule_id:
        return {'valid': False, 'error': "Rule must have an 'id' field"}

    # Try to instantiate a correlator with just this rule
    try:
        SpiderFootCorrelator(dbh, {rule_id: yaml_content})
        # If no exception, the rule is valid
        return {'valid': True, 'error': None}
    except SyntaxError as e:
        return {'valid': False, 'error': str(e)}
    except Exception as e:
        return {'valid': False, 'error': f"Validation error: {e}"}


# ── AI Rule Generation ───────────────────────────────────────────────────


@router.post("/correlation-rules/ai-generate")
def ai_generate_rule(
    body: AiRuleGenerateRequest,
    user: dict = Depends(require_permission("correlation_rules", "create")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Use AI to generate or improve a correlation rule from a natural language description."""
    # Check AI is configured
    provider = config.get("_ai_provider", "openai")
    key_opt = f"_ai_{provider}_key"
    if not config.get(key_opt, ""):
        return ["ERROR", f"No API key configured for {provider}. Go to Settings to configure."]

    prompt = body.prompt.strip()
    if not prompt:
        return ["ERROR", "Prompt cannot be empty"]
    if len(prompt) > 4000:
        return ["ERROR", "Prompt is too long (max 4000 characters)"]

    try:
        from api.services.ai_rules import generate_rule
        result = generate_rule(config, dbh, prompt, body.existing_yaml)
        return ["SUCCESS", result]
    except ValueError as e:
        return ["ERROR", str(e)]
    except Exception as e:
        log.error(f"AI rule generation failed: {e}", exc_info=True)
        return ["ERROR", "AI rule generation failed. Please try again."]

"""API key encryption service using Fernet (AES-128-CBC + HMAC).

Stores a persistent encryption key at ~/.spiderfoot/secret.key so that
API keys encrypted in the database can be decrypted across process restarts.
"""

import contextlib
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from spiderfoot import SpiderFootHelpers

log = logging.getLogger(f"spiderfoot.{__name__}")


def _get_or_create_secret_key() -> bytes:
    """Get or create a persistent Fernet encryption key.

    Stored alongside the SQLite database at ~/.spiderfoot/secret.key.
    Auto-generated on first use with restricted file permissions.
    """
    data_path = SpiderFootHelpers.dataPath()
    key_file = Path(data_path) / "secret.key"

    if key_file.exists():
        return key_file.read_bytes().strip()

    key = Fernet.generate_key()
    key_file.write_bytes(key)

    with contextlib.suppress(OSError):
        os.chmod(str(key_file), 0o600)

    log.info("Generated new encryption key for AI API key storage")
    return key


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt an API key for storage in the database.

    Args:
        plaintext: the raw API key string

    Returns:
        Fernet-encrypted ciphertext as a string
    """
    if not plaintext:
        return ""
    key = _get_or_create_secret_key()
    f = Fernet(key)
    return f.encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt an API key retrieved from the database.

    Args:
        ciphertext: Fernet-encrypted string from the database

    Returns:
        The original plaintext API key, or empty string on failure
    """
    if not ciphertext:
        return ""
    try:
        key = _get_or_create_secret_key()
        f = Fernet(key)
        return f.decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception) as e:
        log.error(f"Failed to decrypt API key: {e}")
        return ""

"""Token encryption utilities using Fernet symmetric encryption."""

import os
import base64
import secrets
from cryptography.fernet import Fernet, InvalidToken


# Prefix to identify encrypted tokens
ENCRYPTED_PREFIX = "enc:v1:"


def get_encryption_key() -> bytes | None:
    """Get the encryption key from environment variable.

    Returns None if not configured, which disables encryption.
    """
    key = os.getenv("TOKEN_ENCRYPTION_KEY", "")
    if not key:
        return None

    # The key should be a valid Fernet key (32 url-safe base64-encoded bytes)
    try:
        # Validate it's a proper Fernet key
        Fernet(key.encode())
        return key.encode()
    except Exception:
        return None


def generate_encryption_key() -> str:
    """Generate a new Fernet encryption key.

    Use this to generate a key for TOKEN_ENCRYPTION_KEY env var.
    """
    return Fernet.generate_key().decode()


def encrypt_token(token: str) -> str:
    """Encrypt a token for storage.

    If encryption is not configured, returns the token unchanged.
    If already encrypted, returns unchanged.

    Args:
        token: The plaintext token to encrypt

    Returns:
        Encrypted token with prefix, or original token if encryption disabled
    """
    if not token:
        return token

    # Already encrypted
    if token.startswith(ENCRYPTED_PREFIX):
        return token

    key = get_encryption_key()
    if not key:
        # Encryption not configured, return as-is
        return token

    try:
        f = Fernet(key)
        encrypted = f.encrypt(token.encode())
        return ENCRYPTED_PREFIX + encrypted.decode()
    except Exception:
        # If encryption fails, return original (shouldn't happen with valid key)
        return token


def decrypt_token(encrypted_token: str) -> str:
    """Decrypt a stored token.

    If token is not encrypted (no prefix), returns as-is.
    If decryption fails, returns empty string for security.

    Args:
        encrypted_token: The encrypted token to decrypt

    Returns:
        Decrypted plaintext token, or original if not encrypted
    """
    if not encrypted_token:
        return encrypted_token

    # Not encrypted
    if not encrypted_token.startswith(ENCRYPTED_PREFIX):
        return encrypted_token

    key = get_encryption_key()
    if not key:
        # Encryption key not available, can't decrypt
        return ""

    try:
        f = Fernet(key)
        encrypted_data = encrypted_token[len(ENCRYPTED_PREFIX):]
        decrypted = f.decrypt(encrypted_data.encode())
        return decrypted.decode()
    except InvalidToken:
        # Invalid encrypted data or wrong key
        return ""
    except Exception:
        return ""


def is_encrypted(token: str) -> bool:
    """Check if a token is encrypted."""
    return token.startswith(ENCRYPTED_PREFIX) if token else False

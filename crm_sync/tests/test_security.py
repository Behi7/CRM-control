import os
import json
import base64
import pytest
from unittest.mock import patch
from cryptography.exceptions import InvalidTag
from app.core import security
from app.core.security import _get_encryption_key, encrypt_token, decrypt_token

def test_get_encryption_key_empty():
    with patch("app.core.security.settings.TOKEN_ENCRYPTION_KEY", ""):
        with pytest.raises(RuntimeError, match="TOKEN_ENCRYPTION_KEY is not set"):
            _get_encryption_key()

def test_get_encryption_key_hex_64():
    hex_key = "a" * 64
    with patch("app.core.security.settings.TOKEN_ENCRYPTION_KEY", hex_key):
        key = _get_encryption_key()
        assert len(key) == 32
        assert key == bytes.fromhex(hex_key)

def test_get_encryption_key_utf8_32():
    utf8_key = "12345678901234567890123456789012"
    with patch("app.core.security.settings.TOKEN_ENCRYPTION_KEY", utf8_key):
        key = _get_encryption_key()
        assert len(key) == 32
        assert key == utf8_key.encode("utf-8")

def test_get_encryption_key_base64():
    raw_bytes = b"k" * 32
    b64_key = base64.b64encode(raw_bytes).decode("ascii")
    with patch("app.core.security.settings.TOKEN_ENCRYPTION_KEY", b64_key):
        key = _get_encryption_key()
        assert len(key) == 32
        assert key == raw_bytes

def test_get_encryption_key_invalid_length():
    # 10 bytes base64 encoded
    short_b64 = base64.b64encode(b"short10byt").decode("ascii")
    with patch("app.core.security.settings.TOKEN_ENCRYPTION_KEY", short_b64):
        with pytest.raises(RuntimeError, match="AES-GCM requires 16, 24, or 32 bytes"):
            _get_encryption_key()

def test_get_encryption_key_invalid_format():
    with patch("app.core.security.settings.TOKEN_ENCRYPTION_KEY", "!!!invalid-base64-and-not-32!!!"):
        with pytest.raises(RuntimeError, match="not valid hex, UTF-8"):
            _get_encryption_key()

def test_encrypt_decrypt_token_roundtrip():
    secret = "my-secret-access-token-98765"
    encrypted = encrypt_token(secret)
    assert isinstance(encrypted, str)

    payload = json.loads(encrypted)
    assert payload["version"] == 1
    assert "nonce" in payload
    assert "ciphertext" in payload
    assert "authTag" in payload

    decrypted = decrypt_token(encrypted)
    assert decrypted == secret

def test_encrypt_decrypt_unicode_and_symbols():
    secret = "секретный_токен_crm_🔥_100%_success_!@#$%^&*()"
    encrypted = encrypt_token(secret)
    decrypted = decrypt_token(encrypted)
    assert decrypted == secret

def test_encrypt_random_nonce():
    secret = "same-token-for-both"
    enc1 = encrypt_token(secret)
    enc2 = encrypt_token(secret)
    assert enc1 != enc2
    p1 = json.loads(enc1)
    p2 = json.loads(enc2)
    assert p1["nonce"] != p2["nonce"]

def test_decrypt_token_corrupted_ciphertext():
    valid = encrypt_token("secret")
    payload = json.loads(valid)
    raw_ct = base64.b64decode(payload["ciphertext"])
    corrupted_ct = bytes([raw_ct[0] ^ 0xFF]) + raw_ct[1:]
    payload["ciphertext"] = base64.b64encode(corrupted_ct).decode("ascii")

    with pytest.raises(InvalidTag):
        decrypt_token(json.dumps(payload))

def test_decrypt_token_corrupted_tag():
    valid = encrypt_token("secret")
    payload = json.loads(valid)
    raw_tag = base64.b64decode(payload["authTag"])
    corrupted_tag = bytes([raw_tag[0] ^ 0xFF]) + raw_tag[1:]
    payload["authTag"] = base64.b64encode(corrupted_tag).decode("ascii")

    with pytest.raises(InvalidTag):
        decrypt_token(json.dumps(payload))

def test_decrypt_token_invalid_json():
    with pytest.raises(json.JSONDecodeError):
        decrypt_token("not-json-content")

def test_decrypt_token_missing_keys():
    valid_b64 = base64.b64encode(b"123456789012").decode("ascii")
    with pytest.raises(KeyError):
        decrypt_token(json.dumps({"version": 1, "nonce": valid_b64}))

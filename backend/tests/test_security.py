import pytest
from fastapi import HTTPException
from app.core.security import encrypt_token, decrypt_token

def test_encrypt_decrypt_token_success():
    secret = "test-secret-token-123"
    encrypted = encrypt_token(secret)
    decrypted = decrypt_token(encrypted)
    assert decrypted == secret

def test_decrypt_token_invalid_json():
    invalid_payload = "not-valid-json"
    with pytest.raises(HTTPException) as exc_info:
        decrypt_token(invalid_payload)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Token decryption failed"

def test_decrypt_token_corrupted_payload():
    valid_enc = encrypt_token("some-secret")
    # Corrupt the payload ciphertext
    corrupted_payload = valid_enc.replace("a", "b")
    with pytest.raises(HTTPException) as exc_info:
        decrypt_token(corrupted_payload)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Token decryption failed"

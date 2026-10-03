import os
import json
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import settings

def _get_encryption_key() -> bytes:
    raw = (settings.TOKEN_ENCRYPTION_KEY or "").strip()
    if not raw:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not set. Cannot start sync worker.")

    key: bytes
    if len(raw) == 64 and all(c in "0123456789abcdefABCDEF" for c in raw):
        key = bytes.fromhex(raw)
    elif len(raw.encode("utf-8")) == 32:
        key = raw.encode("utf-8")
    else:
        try:
            key = base64.b64decode(raw, validate=True)
        except Exception as e:
            raise RuntimeError(f"TOKEN_ENCRYPTION_KEY is not valid hex, UTF-8(32), or base64: {e}")

    if len(key) not in (16, 24, 32):
        raise RuntimeError(
            f"TOKEN_ENCRYPTION_KEY decoded to {len(key)} bytes, "
            f"but AES-GCM requires 16, 24, or 32 bytes."
        )
    return key

# Fail-fast: validate key at module import time
_ENCRYPTION_KEY = _get_encryption_key()

def decrypt_token(data_str: str) -> str:
    """
    Расшифровывает токен из JSON-структуры Node.js CryptoService:
    { "version": 1, "nonce": "...", "ciphertext": "...", "authTag": "..." }
    """
    obj = json.loads(data_str)
    nonce = base64.b64decode(obj["nonce"])
    ct = base64.b64decode(obj["ciphertext"])
    tag = base64.b64decode(obj["authTag"])

    aesgcm = AESGCM(_ENCRYPTION_KEY)
    decrypted = aesgcm.decrypt(nonce, ct + tag, None)
    return decrypted.decode("utf-8")

def encrypt_token(secret: str) -> str:
    """
    Шифрует токен в JSON-структуру, совместимую с Node.js CryptoService:
    { "version": 1, "nonce": "...", "ciphertext": "...", "authTag": "..." }
    """
    aesgcm = AESGCM(_ENCRYPTION_KEY)
    nonce = os.urandom(12)
    ct_tag = aesgcm.encrypt(nonce, secret.encode("utf-8"), None)
    ciphertext = ct_tag[:-16]
    auth_tag = ct_tag[-16:]

    payload = {
        "version": 1,
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
        "authTag": base64.b64encode(auth_tag).decode("ascii"),
    }
    return json.dumps(payload)


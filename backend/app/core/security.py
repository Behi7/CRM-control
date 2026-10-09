import os
import json
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import jwt
import bcrypt
from fastapi import HTTPException, Header, Depends, status
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import settings

def _get_encryption_key() -> bytes:
    raw = (settings.TOKEN_ENCRYPTION_KEY or '').strip()
    if len(raw) == 64:
        try:
            return bytes.fromhex(raw)
        except ValueError:
            pass
    if len(raw.encode('utf-8')) == 32:
        return raw.encode('utf-8')
    try:
        b = base64.b64decode(raw)
        if len(b) == 32:
            return b
    except Exception:
        pass
    # fallback 32 bytes
    return raw.encode('utf-8')[:32].ljust(32, b'\0')

_AES_KEY = _get_encryption_key()

def encrypt_token(plain: str) -> str:
    aesgcm = AESGCM(_AES_KEY)
    nonce = secrets.token_bytes(12)
    enc = aesgcm.encrypt(nonce, plain.encode('utf-8'), None)
    ciphertext = enc[:-16]
    auth_tag = enc[-16:]
    return json.dumps({
        "version": 1,
        "nonce": base64.b64encode(nonce).decode('utf-8'),
        "ciphertext": base64.b64encode(ciphertext).decode('utf-8'),
        "authTag": base64.b64encode(auth_tag).decode('utf-8'),
    })

def decrypt_token(encrypted_json: str) -> str:
    try:
        obj = json.loads(encrypted_json)
        nonce = base64.b64decode(obj["nonce"])
        ciphertext = base64.b64decode(obj["ciphertext"])
        auth_tag = base64.b64decode(obj["authTag"])
        aesgcm = AESGCM(_AES_KEY)
        dec = aesgcm.decrypt(nonce, ciphertext + auth_tag, None)
        return dec.decode('utf-8')
    except Exception:
        # Prevent leaking sensitive internal exception details to clients
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token decryption failed"
        )

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def create_access_token(user_id: int, role: str, account_id: Optional[int], expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    payload = {
        "sub": user_id,
        "role": role,
        "accountId": account_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_ACCESS_SECRET, algorithm="HS256")

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)

def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

def get_current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.JWT_ACCESS_SECRET, algorithms=["HS256"])
        return {
            "userId": payload.get("sub"),
            "role": payload.get("role"),
            "accountId": payload.get("accountId"),
        }
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user

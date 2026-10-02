from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import (
    require_admin, hash_password, encrypt_token
)
from app.core.crm_client import CrmClient
from app.models import Account, User, Notification
from app.modules.admin.schemas import (
    CreateAccountDto, PatchAccountDto, UpdateAiSettingsDto, TestAiDto
)

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])

def serialize_account(acc: Account) -> dict:
    return {
        "id": acc.id,
        "subdomain": acc.subdomain,
        "externalAccountId": acc.external_account_id,
        "baseDomain": acc.base_domain,
        "tokenExpiresAt": acc.token_expires_at.isoformat() if acc.token_expires_at else None,
        "tokenStatus": acc.token_status,
        "subscriptionStatus": acc.subscription_status,
        "status": acc.status,
        "syncStatus": acc.sync_status,
        "timezone": acc.timezone,
        "lastSyncedAt": acc.last_synced_at.isoformat() if acc.last_synced_at else None,
        "backfillStatus": acc.backfill_status,
        "backfillError": acc.backfill_error,
        "backfillErrorAt": acc.backfill_error_at.isoformat() if acc.backfill_error_at else None,
        "aiEnabled": acc.ai_enabled,
        "aiModel": acc.ai_model,
        "aiCompanyContext": acc.ai_company_context,
        "createdAt": acc.created_at.isoformat() if acc.created_at else None,
        "users": [{"id": u.id, "email": u.email, "role": u.role} for u in (acc.users or []) if u.role == "viewer"],
    }

@router.get("/accounts")
async def list_accounts(db: AsyncSession = Depends(get_db)):
    stmt = select(Account).options(selectinload(Account.users)).order_by(Account.created_at.desc())
    res = await db.execute(stmt)
    accounts = res.scalars().all()
    return [serialize_account(a) for a in accounts]

@router.post("/accounts")
async def create_account(dto: CreateAccountDto, db: AsyncSession = Depends(get_db)):
    clean_subdomain = dto.subdomain.strip().lower()
    base_domain = dto.baseDomain.strip().lower()

    # 1. Verify token with AmoCRM
    resp = await CrmClient.request(
        subdomain=clean_subdomain,
        base_domain=base_domain,
        token=dto.token,
        method="GET",
        path="/api/v4/account"
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"amoCRM returned {resp.status_code}")

    amo_data = resp.json()
    ext_id = str(amo_data.get("id"))
    tz = amo_data.get("timezone", "UTC")

    # 2. Check conflict
    existing_acc_stmt = select(Account).where(
        Account.subdomain == clean_subdomain,
        Account.base_domain == base_domain
    )
    res = await db.execute(existing_acc_stmt)
    existing_acc = res.scalar_one_or_none()
    if existing_acc and existing_acc.status != "disconnected":
        raise HTTPException(status_code=409, detail="Аккаунт с таким субдоменом уже существует")

    clean_email = dto.email.strip().lower()
    user_stmt = select(User).where(User.email == clean_email)
    user_res = await db.execute(user_stmt)
    if user_res.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists")

    encrypted_token = encrypt_token(dto.token)
    pw_hash = hash_password(dto.password)

    token_expires_at = None
    if dto.tokenExpiresAt:
        try:
            token_expires_at = datetime.fromisoformat(dto.tokenExpiresAt.replace("Z", "+00:00"))
        except Exception:
            pass

    if existing_acc:
        existing_acc.external_account_id = ext_id
        existing_acc.encrypted_token = encrypted_token
        existing_acc.token_expires_at = token_expires_at
        existing_acc.token_status = "active"
        existing_acc.subscription_status = "active"
        existing_acc.status = "connected"
        existing_acc.sync_status = "active"
        existing_acc.timezone = tz
        existing_acc.backfill_status = "pending"
        existing_acc.backfill_error = None
        account = existing_acc
    else:
        account = Account(
            subdomain=clean_subdomain,
            base_domain=base_domain,
            external_account_id=ext_id,
            encrypted_token=encrypted_token,
            token_expires_at=token_expires_at,
            timezone=tz,
            backfill_status="pending",
        )
        db.add(account)
        await db.flush()

    new_user = User(
        email=clean_email,
        password_hash=pw_hash,
        role="viewer",
        account_id=account.id,
    )
    db.add(new_user)
    await db.commit()

    # Re-query with users
    stmt = select(Account).options(selectinload(Account.users)).where(Account.id == account.id)
    final_res = await db.execute(stmt)
    created = final_res.scalar_one()
    return serialize_account(created)

@router.patch("/accounts/{account_id}")
async def patch_account(account_id: int, dto: PatchAccountDto, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).options(selectinload(Account.users)).where(Account.id == account_id)
    res = await db.execute(stmt)
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    if dto.token:
        resp = await CrmClient.request(
            subdomain=acc.subdomain,
            base_domain=acc.base_domain,
            token=dto.token,
            method="GET",
            path="/api/v4/account"
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"amoCRM returned {resp.status_code}")
        acc.encrypted_token = encrypt_token(dto.token)
        acc.token_status = "active"
        if dto.tokenExpiresAt:
            try:
                acc.token_expires_at = datetime.fromisoformat(dto.tokenExpiresAt.replace("Z", "+00:00"))
            except Exception:
                pass

    viewer = next((u for u in acc.users if u.role == "viewer"), None)
    if viewer:
        if dto.email:
            viewer.email = dto.email.strip().lower()
        if dto.password:
            viewer.password_hash = hash_password(dto.password)

    await db.commit()
    return serialize_account(acc)

@router.delete("/accounts/{account_id}")
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).where(Account.id == account_id)
    res = await db.execute(stmt)
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    acc.status = "disconnected"
    acc.sync_status = "stopped"
    await db.commit()
    return {"ok": True}

@router.post("/accounts/{account_id}/retry-backfill")
async def retry_backfill(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).where(Account.id == account_id)
    res = await db.execute(stmt)
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    acc.backfill_status = "pending"
    acc.backfill_error = None
    acc.backfill_error_at = None
    await db.commit()
    return {"ok": True}

@router.post("/accounts/{account_id}/stop-sync")
async def stop_sync(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).where(Account.id == account_id)
    res = await db.execute(stmt)
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    acc.sync_status = "stopped"
    await db.commit()
    return {"ok": True}

@router.post("/accounts/{account_id}/start-sync")
async def start_sync(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).where(Account.id == account_id)
    res = await db.execute(stmt)
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    acc.sync_status = "active"
    await db.commit()
    return {"ok": True}

@router.get("/accounts/{account_id}/ai-settings")
async def get_ai_settings(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).where(Account.id == account_id)
    res = await db.execute(stmt)
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    return {
        "accountId": acc.id,
        "aiEnabled": acc.ai_enabled,
        "aiModel": acc.ai_model or "gemini-2.5-flash",
        "hasToken": bool(acc.ai_encrypted_token),
        "aiCompanyContext": acc.ai_company_context or "",
    }

@router.patch("/accounts/{account_id}/ai-settings")
async def update_ai_settings(account_id: int, dto: UpdateAiSettingsDto, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).where(Account.id == account_id)
    res = await db.execute(stmt)
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    if dto.aiEnabled is not None:
        acc.ai_enabled = dto.aiEnabled
    if dto.aiModel is not None:
        acc.ai_model = dto.aiModel.strip()
    if dto.aiCompanyContext is not None:
        acc.ai_company_context = dto.aiCompanyContext.strip()
    if dto.aiToken:
        acc.ai_encrypted_token = encrypt_token(dto.aiToken.strip())

    await db.commit()
    return {
        "accountId": acc.id,
        "aiEnabled": acc.ai_enabled,
        "aiModel": acc.ai_model or "gemini-2.5-flash",
        "hasToken": bool(acc.ai_encrypted_token),
        "aiCompanyContext": acc.ai_company_context or "",
    }

@router.get("/notifications")
async def list_notifications(unreadOnly: Optional[str] = Query(default=None), db: AsyncSession = Depends(get_db)):
    stmt = select(Notification).order_by(Notification.created_at.desc()).limit(200)
    if unreadOnly == "true":
        stmt = stmt.where(Notification.is_read == False)
    res = await db.execute(stmt)
    notifs = res.scalars().all()
    return [
        {
            "id": n.id,
            "accountId": n.account_id,
            "type": n.type,
            "message": n.message,
            "isRead": n.is_read,
            "createdAt": n.created_at.isoformat(),
        }
        for n in notifs
    ]

@router.post("/notifications/{id}/read")
async def mark_notification_read(id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Notification).where(Notification.id == id)
    res = await db.execute(stmt)
    n = res.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    await db.commit()
    return {"ok": True}

@router.post("/ai/test")
async def test_ai(body: TestAiDto):
    clean_model = (body.model or "gemini-2.5-flash").strip().removeprefix("models/")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={body.token.strip()}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"role": "user", "parts": [{"text": "Ответь одним словом OK для проверки связи."}]}]
                },
            )
            if resp.status_code != 200:
                err_data = resp.json().get("error", {}) if resp.headers.get("content-type", "").startswith("application/json") else {}
                err_msg = err_data.get("message") or f"HTTP {resp.status_code}"
                return {"ok": False, "message": f"Ошибка Gemini API: {err_msg}"}
            return {"ok": True, "message": "Соединение с моделью успешно проверено!"}
    except Exception as e:
        return {"ok": False, "message": f"Ошибка запроса: {str(e)}"}

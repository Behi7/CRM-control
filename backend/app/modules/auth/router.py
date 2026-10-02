from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.config import settings
from app.core.database import get_db
from app.core.security import (
    verify_password, create_access_token, generate_refresh_token,
    hash_refresh_token, get_current_user
)
from app.models import User, RefreshToken, Account
from app.modules.auth.schemas import LoginDto, AuthResponse, RefreshDto

router = APIRouter(prefix="/auth", tags=["Auth"])

def set_refresh_cookie(response: Response, refresh_token: str):
    max_age = settings.REFRESH_TOKEN_TTL_DAYS * 86400
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        domain=settings.COOKIE_DOMAIN,
        path="/",
        max_age=max_age,
    )

@router.post("/login", response_model=AuthResponse)
async def login(dto: LoginDto, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    clean_email = dto.email.strip().lower()
    stmt = select(User).where(User.email == clean_email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(dto.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # If viewer, check account status
    if user.account_id:
        acc_stmt = select(Account).where(Account.id == user.account_id)
        acc_res = await db.execute(acc_stmt)
        acc = acc_res.scalar_one_or_none()
        if acc and acc.status == "disconnected":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disconnected")

    access_token = create_access_token(user.id, user.role, user.account_id)
    refresh_token = generate_refresh_token()
    token_hash = hash_refresh_token(refresh_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS)

    db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(db_refresh)
    await db.commit()

    set_refresh_cookie(response, refresh_token)
    return AuthResponse(accessToken=access_token, refreshToken=refresh_token, role=user.role)

@router.post("/refresh", response_model=AuthResponse)
async def refresh(request: Request, response: Response, dto: RefreshDto = None, db: AsyncSession = Depends(get_db)):
    raw_token = request.cookies.get("refresh_token") or (dto.refreshToken if dto else None)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    token_hash = hash_refresh_token(raw_token)
    now = datetime.now(timezone.utc)

    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    res = await db.execute(stmt)
    stored_token = res.scalar_one_or_none()

    if not stored_token or stored_token.expires_at < now:
        response.delete_cookie("refresh_token", path="/")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user_stmt = select(User).where(User.id == stored_token.user_id)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()

    if not user:
        response.delete_cookie("refresh_token", path="/")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate token
    await db.delete(stored_token)

    new_access_token = create_access_token(user.id, user.role, user.account_id)
    new_refresh_token = generate_refresh_token()
    new_token_hash = hash_refresh_token(new_refresh_token)
    new_expires_at = now + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS)

    new_db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=new_token_hash,
        expires_at=new_expires_at,
    )
    db.add(new_db_refresh)
    await db.commit()

    set_refresh_cookie(response, new_refresh_token)
    return AuthResponse(accessToken=new_access_token, refreshToken=new_refresh_token, role=user.role)

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, dto: RefreshDto = None, db: AsyncSession = Depends(get_db)):
    raw_token = request.cookies.get("refresh_token") or (dto.refreshToken if dto else None)
    if raw_token:
        token_hash = hash_refresh_token(raw_token)
        await db.execute(delete(RefreshToken).where(RefreshToken.token_hash == token_hash))
        await db.commit()
    response.delete_cookie("refresh_token", path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user_stmt = select(User).where(User.id == current_user["userId"])
    res = await db.execute(user_stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "accountId": user.account_id,
        "createdAt": user.created_at.isoformat(),
    }

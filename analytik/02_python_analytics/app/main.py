import os
import jwt
from fastapi import FastAPI, Depends, HTTPException, Header
from sqlalchemy import create_engine, text

app = FastAPI(title="AmoCRM Analytics - Module 02 (Python)")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/amocrm_analytics")
JWT_ACCESS_SECRET = os.getenv("JWT_ACCESS_SECRET", "")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def get_current_user(authorization: str | None = Header(default=None)):
    """Проверка общего JWT-токена от главного приложения (01_time_analytics)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, JWT_ACCESS_SECRET, algorithms=["HS256"])
        return payload  # содержит sub (userId), role ('admin'|'client'), accountId
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@app.get("/health")
def health():
    return {"status": "ok", "module": "02_python_analytics"}


@app.get("/summary/{account_id}")
def get_account_summary(account_id: int, user: dict = Depends(get_current_user)):
    """Пример эндпоинта: читает данные напрямую из общей БД amocrm_analytics."""
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

    with engine.connect() as conn:
        leads_count = conn.execute(
            text('SELECT COUNT(*) FROM "Lead" WHERE "accountId" = :acc_id'),
            {"acc_id": account_id},
        ).scalar()

    return {
        "module": "02_python_analytics",
        "accountId": account_id,
        "totalLeadsInDb": leads_count or 0,
    }

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from app.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models import User

# Routers
from app.modules.auth.router import router as auth_router
from app.modules.admin.router import router as admin_router
from app.modules.analytics.router import router as analytics_router
from app.modules.ai_chat.router import router as ai_router
from app.modules.quality_control.router import router as qc_router
from app.modules.quality_control.service import qc_background_worker
from app.modules.crm_nodes.router import router as crm_nodes_router
from app.modules.anomaly_deals.router import router as anomaly_deals_router
import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Seed admin user if not exists
    try:
        async with AsyncSessionLocal() as session:
            admin_email = settings.ADMIN_EMAIL.strip().lower()
            stmt = select(User).where(User.email == admin_email)
            res = await session.execute(stmt)
            existing = res.scalar_one_or_none()
            if not existing:
                pw_hash = hash_password(settings.ADMIN_PASSWORD)
                new_admin = User(
                    email=admin_email,
                    password_hash=pw_hash,
                    role="admin",
                )
                session.add(new_admin)
                await session.commit()
                print(f"[Core] Seeded default admin user: {admin_email}")
            else:
                print(f"[Core] Admin user already exists: {admin_email}")
    except Exception as e:
        print(f"[Core] Startup database check warning: {e}")

    # Launch QC processing worker in background
    qc_task = asyncio.create_task(qc_background_worker())

    yield

    # Shutdown
    qc_task.cancel()
    try:
        await qc_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="AmoCRM Analytics - Unified Python Backend",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health
@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": "unified_python_backend",
        "version": "2.0.0",
        "modules": [
            "auth", "admin", "analytics", "ai_chat", "ai_predictions",
            "quality_control", "crm_nodes", "anomaly_deals"
        ]
    }

# Mount Routers directly
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(ai_router)
app.include_router(qc_router)
app.include_router(crm_nodes_router)
app.include_router(anomaly_deals_router)

# Mount Routers under /api prefix as well (for direct proxying without url rewriting)
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(analytics_router, prefix="/api/py2")
app.include_router(ai_router, prefix="/api")
app.include_router(ai_router, prefix="/api/py3")
app.include_router(qc_router, prefix="/api")
app.include_router(crm_nodes_router, prefix="/api")
app.include_router(anomaly_deals_router, prefix="/api")

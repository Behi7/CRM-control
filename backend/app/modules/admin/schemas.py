from typing import Optional
from pydantic import BaseModel, EmailStr

class CreateAccountDto(BaseModel):
    email: str
    password: str
    subdomain: str
    token: str
    tokenExpiresAt: Optional[str] = None
    baseDomain: str = "amocrm.ru"

class PatchAccountDto(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None
    tokenExpiresAt: Optional[str] = None

class UpdateAiSettingsDto(BaseModel):
    aiEnabled: Optional[bool] = None
    aiModel: Optional[str] = None
    aiToken: Optional[str] = None
    aiCompanyContext: Optional[str] = None

class TestAiDto(BaseModel):
    model: str
    token: str

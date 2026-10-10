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
    qcEnabled: Optional[bool] = None
    qcMinDurationSec: Optional[int] = None
    qcMaxDurationSec: Optional[int] = None
    qcRescueThresholdScore: Optional[int] = None
    qcSystemPrompt: Optional[str] = None
    qcDisabledPipelineIds: Optional[list[int]] = None

class TestAiDto(BaseModel):
    model: str
    token: str

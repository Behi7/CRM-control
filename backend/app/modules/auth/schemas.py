from pydantic import BaseModel
from typing import Optional

class LoginDto(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    accessToken: str
    refreshToken: str
    role: str

class RefreshDto(BaseModel):
    refreshToken: Optional[str] = None

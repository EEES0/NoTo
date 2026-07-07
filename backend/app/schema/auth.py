
from pydantic import BaseModel

class SignUpRequest(BaseModel):
    email: str
    nickname: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str
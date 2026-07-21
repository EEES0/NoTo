import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import User
from app.core.security import hash_password
from app.schema.auth import SignUpRequest, LoginRequest
from app.core.security import verify_password, create_access_token, verify_token
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
router = APIRouter(prefix="/auth", tags=["Auth"])


def get_admin_emails():
    return {
        email.strip().lower()
        for email in os.getenv("ADMIN_EMAILS", "").split(",")
        if email.strip()
    }

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):

    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid Token"
        )

    user = (
        db.query(User)
        .filter(User.id == int(payload["sub"]))
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return user


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "nickname": current_user.nickname,
        "is_admin": current_user.is_admin
    }


@router.post("/signup")
def signup(
    req: SignUpRequest,
    db: Session = Depends(get_db)
):
    email = req.email.strip().lower()

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if user:
        raise HTTPException(
            status_code=400,
            detail="이미 존재하는 이메일입니다."
        )

    user = User(
        email=email,
        nickname=req.nickname,
        password=hash_password(req.password),
        is_admin=email in get_admin_emails()
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "회원가입 성공"
    }

@router.post("/login")
def login(
    req: LoginRequest,
    db: Session = Depends(get_db)
):

    user = (
        db.query(User)
        .filter(User.email == req.email.strip().lower())
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )

    if not verify_password(req.password, user.password):
        raise HTTPException(
            status_code=401,
            detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )

    token = create_access_token(
        {
            "sub": str(user.id)
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "nickname": user.nickname,
            "is_admin": user.is_admin
        }
    }


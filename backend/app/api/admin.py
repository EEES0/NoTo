import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database.database import SessionLocal, get_db
from app.database.models import Material, User
from app.schema.admin import AdminStatusRequest

router = APIRouter(prefix="/admin", tags=["Admin"])

def initialize_admin_users() -> None:
    """앱 시작 시 ADMIN_EMAILS에 등록된 계정에 관리자 권한을 부여한다.
    라우트 핸들러가 아니라 startup 훅에서 직접 호출되는 일반 함수이므로
    FastAPI Depends를 파라미터로 두지 않는다."""
    admin_emails = [
        email.strip().lower()
        for email in os.getenv("ADMIN_EMAILS", "").split(",")
        if email.strip()
    ]

    if not admin_emails:
        return

    with SessionLocal() as db:
        db.execute(
            update(User)
            .where(func.lower(User.email).in_(admin_emails))
            .values(is_admin=True)
        )
        db.commit()
    

def get_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Admin permission required"
        )

    return current_user


@router.get("/users")
def get_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    users = db.query(User).order_by(User.id.asc()).all()

    return [
        {
            "id": user.id,
            "email": user.email,
            "nickname": user.nickname,
            "is_admin": user.is_admin,
        }
        for user in users
    ]


@router.patch("/users/{user_id}/admin")
def update_user_admin_status(
    user_id: int,
    req: AdminStatusRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    if user_id == admin_user.id and not req.is_admin:
        raise HTTPException(
            status_code=400,
            detail="You cannot remove your own admin permission"
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user.is_admin = req.is_admin
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "is_admin": user.is_admin,
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    if user_id == admin_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own admin account"
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    db.query(Material).filter(Material.user_id == user.id).delete()
    db.delete(user)
    db.commit()

    return {
        "message": "User deleted successfully"
    }


@router.get("/materials")
def get_all_materials(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    materials = (
        db.query(Material, User)
        .join(User, Material.user_id == User.id)
        .order_by(Material.created_at.desc())
        .all()
    )

    return [
        {
            "id": material.id,
            "user_id": user.id,
            "user_email": user.email,
            "filename": material.original_filename,
            "status": material.status,
            "transcript": material.transcript,
            "refined_transcript": material.refined_transcript,
            "summary": material.summary,
            "error_message": material.error_message,
            "created_at": material.created_at,
        }
        for material, user in materials
    ]


@router.delete("/materials/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    material = db.query(Material).filter(Material.id == material_id).first()

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found"
        )

    db.delete(material)
    db.commit()

    return {
        "message": "Material deleted successfully"
    }

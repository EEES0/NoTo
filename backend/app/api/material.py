import json
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database.database import SessionLocal, get_db
from app.database.models import Material, User
from app.service.gemini_service import refine_text, summarize_text
from app.service.whisper_service import transcribe

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads"
CHUNK_DIR = UPLOAD_DIR / "chunks"
SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a"}
MATERIAL_STATUS_PROCESSING = "processing"
MATERIAL_STATUS_DONE = "done"
MATERIAL_STATUS_FAILED = "failed"


class ChunkUploadInitRequest(BaseModel):
    filename: str
    total_chunks: int


def serialize_material(material: Material):
    return {
        "id": material.id,
        "filename": material.original_filename,
        "original_filename": material.original_filename,
        "status": material.status,
        "transcript": material.transcript,
        "refined_transcript": material.refined_transcript,
        "summary": material.summary,
        "error_message": material.error_message,
        "created_at": material.created_at,
    }


def validate_supported_file(filename: str) -> str:
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only mp3, wav, and m4a files are supported"
        )

    return extension


def get_upload_metadata(upload_id: str, current_user: User) -> dict:
    metadata_path = CHUNK_DIR / upload_id / "metadata.json"

    if not metadata_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Upload session not found"
        )

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    if metadata["user_id"] != current_user.id:
        raise HTTPException(
            status_code=404,
            detail="Upload session not found"
        )

    return metadata


def process_material_file(material_id: int, file_path: str):
    db = SessionLocal()
    path = Path(file_path)

    try:
        material = db.query(Material).filter(Material.id == material_id).first()

        if material is None:
            return

        transcript = transcribe(str(path))

        material.transcript = transcript
        material.refined_transcript = None
        material.status = MATERIAL_STATUS_DONE
        material.error_message = None
        db.commit()
    except Exception as exc:
        material = db.query(Material).filter(Material.id == material_id).first()

        if material is not None:
            material.status = MATERIAL_STATUS_FAILED
            material.error_message = str(exc)[:1000]
            db.commit()
    finally:
        db.close()

        if path.exists():
            path.unlink()


def create_processing_material(
    db: Session,
    background_tasks: BackgroundTasks,
    current_user: User,
    original_filename: str,
    saved_filename: str,
    file_path: Path,
):
    material = Material(
        user_id=current_user.id,
        original_filename=original_filename,
        saved_filename=saved_filename,
        status=MATERIAL_STATUS_PROCESSING,
        transcript=None,
        refined_transcript=None,
        summary=None,
        error_message=None,
    )

    db.add(material)
    db.commit()
    db.refresh(material)

    background_tasks.add_task(process_material_file, material.id, str(file_path))

    return material


@router.get("/materials")
def get_materials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    materials = (
        db.query(Material)
        .filter(Material.user_id == current_user.id)
        .order_by(Material.created_at.desc())
        .all()
    )

    return [serialize_material(material) for material in materials]


@router.get("/materials/{material_id}")
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    material = (
        db.query(Material)
        .filter(
            Material.id == material_id,
            Material.user_id == current_user.id
        )
        .first()
    )

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found"
        )

    return serialize_material(material)


@router.get("/materials/{material_id}/status")
def get_material_status(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    material = (
        db.query(Material)
        .filter(
            Material.id == material_id,
            Material.user_id == current_user.id
        )
        .first()
    )

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found"
        )

    return serialize_material(material)


@router.delete("/materials/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    material = (
        db.query(Material)
        .filter(
            Material.id == material_id,
            Material.user_id == current_user.id
        )
        .first()
    )

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


@router.post("/materials/uploads/init")
def init_chunk_upload(
    req: ChunkUploadInitRequest,
    current_user: User = Depends(get_current_user)
):
    if req.total_chunks < 1:
        raise HTTPException(
            status_code=400,
            detail="total_chunks must be greater than 0"
        )

    extension = validate_supported_file(req.filename)
    UPLOAD_DIR.mkdir(exist_ok=True)
    CHUNK_DIR.mkdir(exist_ok=True)

    upload_id = str(uuid.uuid4())
    upload_dir = CHUNK_DIR / upload_id
    upload_dir.mkdir()

    metadata = {
        "user_id": current_user.id,
        "filename": req.filename,
        "extension": extension,
        "total_chunks": req.total_chunks,
    }

    (upload_dir / "metadata.json").write_text(
        json.dumps(metadata),
        encoding="utf-8",
    )

    return {
        "upload_id": upload_id,
    }


@router.post("/materials/uploads/{upload_id}/chunks")
async def upload_chunk(
    upload_id: str,
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    metadata = get_upload_metadata(upload_id, current_user)

    if chunk_index < 0 or chunk_index >= metadata["total_chunks"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid chunk index"
        )

    chunk_path = CHUNK_DIR / upload_id / f"chunk_{chunk_index:06d}.part"

    try:
        with chunk_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        await file.close()

    return {
        "upload_id": upload_id,
        "chunk_index": chunk_index,
    }


@router.post("/materials/uploads/{upload_id}/complete")
def complete_chunk_upload(
    upload_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    metadata = get_upload_metadata(upload_id, current_user)
    upload_dir = CHUNK_DIR / upload_id
    saved_filename = f"{uuid.uuid4()}{metadata['extension']}"
    file_path = UPLOAD_DIR / saved_filename
    material = None

    try:
        with file_path.open("wb") as output:
            for chunk_index in range(metadata["total_chunks"]):
                chunk_path = upload_dir / f"chunk_{chunk_index:06d}.part"

                if not chunk_path.exists():
                    raise HTTPException(
                        status_code=400,
                        detail=f"Missing chunk {chunk_index}"
                    )

                with chunk_path.open("rb") as chunk:
                    shutil.copyfileobj(chunk, output)

        material = create_processing_material(
            db=db,
            background_tasks=background_tasks,
            current_user=current_user,
            original_filename=metadata["filename"],
            saved_filename=saved_filename,
            file_path=file_path,
        )
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)

        if material is None and file_path.exists():
            file_path.unlink()

    return serialize_material(material)


@router.post("/materials")
async def create_material(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    UPLOAD_DIR.mkdir(exist_ok=True)

    extension = validate_supported_file(file.filename)
    saved_filename = f"{uuid.uuid4()}{extension}"
    file_path = UPLOAD_DIR / saved_filename

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        material = create_processing_material(
            db=db,
            background_tasks=background_tasks,
            current_user=current_user,
            original_filename=file.filename,
            saved_filename=saved_filename,
            file_path=file_path,
        )
    finally:
        await file.close()

    return serialize_material(material)


@router.post("/materials/{material_id}/refine")
def create_refined_transcript(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    material = (
        db.query(Material)
        .filter(
            Material.id == material_id,
            Material.user_id == current_user.id
        )
        .first()
    )

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found"
        )

    if material.status != MATERIAL_STATUS_DONE or not material.transcript:
        raise HTTPException(
            status_code=400,
            detail="Material is not ready for refinement"
        )

    if material.refined_transcript:
        return {
            "refined_transcript": material.refined_transcript
        }

    material.refined_transcript = refine_text(material.transcript)
    db.commit()
    db.refresh(material)

    return {
        "message": "Refined transcript created successfully",
        "refined_transcript": material.refined_transcript
    }


@router.post("/materials/{material_id}/summary")
def create_summary(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    material = (
        db.query(Material)
        .filter(
            Material.id == material_id,
            Material.user_id == current_user.id
        )
        .first()
    )

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found"
        )

    if material.status != MATERIAL_STATUS_DONE or not material.transcript:
        raise HTTPException(
            status_code=400,
            detail="Material is not ready for summary"
        )

    if material.summary:
        return {
            "summary": material.summary
        }

    summary = summarize_text(material.refined_transcript or material.transcript)
    material.summary = summary
    db.commit()
    db.refresh(material)

    return {
        "message": "Summary created successfully",
        "summary": material.summary
    }

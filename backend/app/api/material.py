from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.database.models import Material
from app.service.whisper_service import transcribe
from app.service.gemini_service import refine_text, summarize_text
import uuid
import shutil

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads"
SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a"}

@router.get("/materials")
def get_materials(db: Session = Depends(get_db)):

    materials = db.query(Material).order_by(Material.created_at.desc()).all()

    return [
        {
            "id": material.id,
            "filename": material.original_filename,
            "transcript": material.transcript,
            "refined_transcript": material.refined_transcript,
            "summary": material.summary,
            "created_at": material.created_at
        }
        for material in materials
    ]
@router.get("/materials/{material_id}")
def get_material(
        material_id: int,
        db: Session = Depends(get_db)
    ):
        material = (
            db.query(Material)
            .filter(Material.id == material_id)
            .first()
        )

        if material is None:
            raise HTTPException(
                status_code=404,
                detail="Material not found"
            )

        return {
            "id": material.id,
            "original_filename": material.original_filename,
            "transcript": material.transcript,
            "refined_transcript": material.refined_transcript,
            "summary": material.summary,
            "created_at": material.created_at
        }
@router.delete("/materials/{material_id}")
def delete_material(
        material_id: int,
        db: Session = Depends(get_db)
    ):

        material = (
            db.query(Material)
            .filter(Material.id == material_id)
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
@router.post("/materials")
async def create_material(
        file: UploadFile = File(...),
        db: Session = Depends(get_db)
    ):
        UPLOAD_DIR.mkdir(exist_ok=True)

        extension = Path(file.filename).suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail="Only mp3, wav, and m4a files are supported"
            )

        saved_filename = f"{uuid.uuid4()}{extension}"
        file_path = UPLOAD_DIR / saved_filename

        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            transcript = transcribe(str(file_path))
            refined_transcript = refine_text(transcript)

            material = Material(
                original_filename=file.filename,
                saved_filename=saved_filename,
                transcript=transcript,
                refined_transcript=refined_transcript
            )

            db.add(material)
            db.commit()
            db.refresh(material)

        finally:
            await file.close()
            if file_path.exists():
                file_path.unlink()

        return {
            "id": material.id,
            "transcript": material.transcript,
            "refined_transcript": material.refined_transcript,
        }

@router.post("/materials/{material_id}/summary")
def create_summary(
    material_id: int,
    db: Session = Depends(get_db)
): 
    material = (
        db.query(Material)
        .filter(Material.id == material_id)
        .first()
    )

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found"
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

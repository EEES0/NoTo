import os
import subprocess
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

MAX_OPENAI_FILE_SIZE = 25 * 1024 * 1024
SAFE_CHUNK_FILE_SIZE = 20 * 1024 * 1024
DEFAULT_CHUNK_SECONDS = 10 * 60


def transcribe(audio_path: str) -> str:
    audio_file_size = os.path.getsize(audio_path)

    if audio_file_size <= SAFE_CHUNK_FILE_SIZE:
        return transcribe_one_file(audio_path)

    return transcribe_large_file(audio_path)


def transcribe_one_file(audio_path: str) -> str:
    with open(audio_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
        )

    return response.text.strip()


def transcribe_large_file(audio_path: str) -> str:
    with tempfile.TemporaryDirectory() as temp_dir:
        chunk_paths = split_audio(audio_path, temp_dir)
        transcripts = []

        for chunk_path in chunk_paths:
            chunk_text = transcribe_one_file(str(chunk_path))
            transcripts.append(chunk_text)

        return "\n".join(transcripts)


def split_audio(audio_path: str, output_dir: str) -> list[Path]:
    duration_seconds = get_audio_duration_seconds(audio_path)
    chunk_paths = []
    start_seconds = 0.0
    chunk_index = 1

    while start_seconds < duration_seconds:
        chunk_path = Path(output_dir) / f"chunk_{chunk_index:03d}.mp3"
        chunk_seconds = min(
            DEFAULT_CHUNK_SECONDS,
            duration_seconds - start_seconds,
        )

        chunk_seconds = export_chunk_under_limit(
            audio_path=audio_path,
            start_seconds=start_seconds,
            chunk_seconds=chunk_seconds,
            chunk_path=chunk_path,
        )

        chunk_paths.append(chunk_path)
        start_seconds += chunk_seconds
        chunk_index += 1

    return chunk_paths


def get_audio_duration_seconds(audio_path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    return float(result.stdout.strip())


def export_chunk_under_limit(
    audio_path: str,
    start_seconds: float,
    chunk_seconds: float,
    chunk_path: Path,
) -> float:
    current_chunk_seconds = chunk_seconds

    while True:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                str(start_seconds),
                "-t",
                str(current_chunk_seconds),
                "-i",
                audio_path,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "64k",
                str(chunk_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        if os.path.getsize(chunk_path) <= SAFE_CHUNK_FILE_SIZE:
            return current_chunk_seconds

        current_chunk_seconds *= 0.8

        if current_chunk_seconds < 1:
            raise ValueError("Audio chunk is still too large after reducing its length.")

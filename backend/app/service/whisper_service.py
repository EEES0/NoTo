import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from pydub import AudioSegment

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

MAX_OPENAI_FILE_SIZE = 25 * 1024 * 1024
SAFE_CHUNK_FILE_SIZE = 20 * 1024 * 1024
MIN_CHUNK_LENGTH_MS = 30 * 1000


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

        for index, chunk_path in enumerate(chunk_paths, start=1):
            chunk_text = transcribe_one_file(str(chunk_path))
            transcripts.append(chunk_text)

        return "\n".join(transcripts)


def split_audio(audio_path: str, output_dir: str) -> list[Path]:
    audio = AudioSegment.from_file(audio_path)

    chunk_length_ms = calculate_chunk_length_ms(audio_path, audio)

    chunk_paths = []

    start_ms = 0
    chunk_index = 1

    while start_ms < len(audio):
        end_ms = min(start_ms + chunk_length_ms, len(audio))

        chunk_path = Path(output_dir) / f"chunk_{chunk_index:03d}.mp3"

        export_chunk_under_limit(
            audio=audio,
            start_ms=start_ms,
            end_ms=end_ms,
            chunk_path=chunk_path,
        )

        chunk_paths.append(chunk_path)

        start_ms = end_ms
        chunk_index += 1

    return chunk_paths


def calculate_chunk_length_ms(audio_path: str, audio: AudioSegment) -> int:
    original_file_size = os.path.getsize(audio_path)

    if original_file_size <= SAFE_CHUNK_FILE_SIZE:
        return len(audio)

    size_ratio = SAFE_CHUNK_FILE_SIZE / original_file_size

    estimated_chunk_length_ms = int(len(audio) * size_ratio * 0.9)

    return max(estimated_chunk_length_ms, MIN_CHUNK_LENGTH_MS)


def export_chunk_under_limit(
    audio: AudioSegment,
    start_ms: int,
    end_ms: int,
    chunk_path: Path,
) -> None:
    current_end_ms = end_ms

    while True:
        chunk = audio[start_ms:current_end_ms]

        chunk.export(
            chunk_path,
            format="mp3",
            bitrate="64k",
        )

        if os.path.getsize(chunk_path) <= SAFE_CHUNK_FILE_SIZE:
            return

        current_end_ms = start_ms + int((current_end_ms - start_ms) * 0.8)

        if current_end_ms - start_ms < MIN_CHUNK_LENGTH_MS:
            raise ValueError("Audio chunk is still too large after reducing its length.")
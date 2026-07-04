from faster_whisper import WhisperModel

model = WhisperModel(
    "medium",
    device="cpu",
    compute_type="int8"
)


def transcribe(audio_path: str) -> str:

    segments, _ = model.transcribe(
        audio_path,
        language="ko"
    )

    text = " ".join(
        segment.text.strip()
        for segment in segments
    )

    return text
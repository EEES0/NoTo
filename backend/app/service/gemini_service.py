import os
from pathlib import Path

from fastapi import HTTPException
from google import genai


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_local_env()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

def refine_text(text: str) -> str:
    prompt = f"""
STT로 변환한 텍스트입니다.

목표:
- 맞춤법과 띄어쓰기를 수정합니다.
- 문장부호를 적절히 추가합니다.
- STT 오인식으로 보이는 부분을 문맥에 맞게 자연스럽게 수정합니다.
- 강의의 순서와 논리 전개를 유지합니다.
- 의미를 바꾸거나 새로운 내용을 추가하지 않습니다.
- 전공 용어, 영어 용어, 약어는 문맥을 고려하여 가장 자연스러운 표현으로 수정합니다.
- 확신할 수 없는 용어는 추측하지 말고 원문을 최대한 유지합니다.

출력은 수정된 텍스트만 반환하세요.

텍스트:
{text}
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    return response.text


def summarize_text(text: str) -> str:
    prompt = f"""
다음은 STT 변환 텍스트를 교정한 것입니다.

규칙
- 텍스트가 너무 짧다면 요약하지 않고 그대로 반환합니다.
- 핵심 개념 중심으로 요약
- 중요한 용어는 유지
- 논리 흐름 유지
- 불필요한 반복 제거
- 5~10개의 문단 또는 항목으로 정리

{text}
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    return response.text
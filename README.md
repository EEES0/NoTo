# NoTo


강의 녹음을 텍스트로 변환하고 내용을 정리하거나 요약할 수 있는 웹 서비스
다음과 같은 백엔드 중심 기능을 경험하기 위해 시작한 개인 프로젝트

- JWT 기반 로그인 및 사용자 인증
- FastAPI 기반 백엔드 서버 구현
- 데이터베이스 활용하여 사용자 및 자료 저장
- STT 변환, 텍스트 정리 및 요약을 위한 AI API 연동
- 프론트엔드와 백엔드 API 연동
- Render, Vercel을 통한 배포 과정 경험


https://noto-teal.vercel.app


# 사용한 기술

BACKEND
- Python
- FastAPI
- SQLAlchemy
- PostgreSQL
- JWT
- OpenAI Whisper API
- Gemini API
- Uvicorn

FRONTEND
- React
- Vite
- Axios

DEPLOYMENT
- FRONTEND : Vercel
- BACKEND : Render
- DATABASE : Render PostgreSQL


# 주요 기능

회원가입 / 로그인

- 이메일, 닉네임, 비밀번호 입력해 회원가입
- 로그인 성공시 JWT 토큰 발급
- 로그인한 사용자만 자료 업로드 및 조회 가능
- 첫 번째 가입자 또는 환경변수에 등록된 이메일은 관리자 권한 부여

음성 파일 업로드

- 사용자는 강의 음성 파일을 업로드할 수 있음
- 현재 지원 확장자:

  - .mp3
  - .wav
  - .m4a

- 업로드된 파일은 서버에서 임시 폴더 생성하여 저장 후 STT 처리
- 처리 완료 후 서버 파일은 삭제하여 저장 공간 낭비 방지

AI 음성 인식

- OpenAI Whisper API를 이용해 음성 파일을 텍스트로 변환
- 변환된 텍스트는 데이터베이스에 저장
- 사용자별로 본인이 업로드한 자료만 조회 가능

AI 정리본 생성

- 변환된 원문 텍스트를 Gemini API를 통해 단어, 맞춤법, 흐름 등 가독성을 위해 가공

요약 생성

- 저장된 강의 텍스트를 정리본 또는 원본 기반으로 요약 생성
- 생성된 요약은 데이터베이스에 저장

자료 관리

- 사용자는 본인이 업로드한 자료 목록을 확인할 수 있음
- 원하는 자료 조회, 삭제 가능

관리자 기능

관리자 계정은 전체 사용자와 전체 자료를 관리할 수 있음

- 전체 사용자 목록 조회
- 사용자 관리자 권한 변경
- 사용자 삭제
- 전체 자료 조회 및 삭제


# .env.example

DATABASE_URL=
OPENAI_API_KEY=
GEMINI_API_KEY=
SECRET_KEY=
ADMIN_EMAILS=
CORS_ORIGINS=


# 문제 해결

  서버 재시작 시 DB 초기화
- 원인 : SQL 및 데이터베이스 입문을 위해 SQLite 사용
- 해결 : Render PostgreSQL 연동하여 서버 인스턴스와 분리

  대용량 파일 처리 불가
- 원인 : OpenAI Whisper 각 파일 25MB 크기 제한, Render 무료 서버 메모리 부담
- 해결 : 프론트에서 파일 크기 검사 후 대용량 파일은 일정 크기의 청크로 나누어 서버 전달
  
  데이터베이스 스키마 변경시 ALTER TABLE 직접 실행
- 원인 : alembic 없이 수동으로 ALTER TABLE
- 해결 : alembic 붙여 migration 자동 관리

#
* GitHub: https://github.com/EEES0
* Project Repository: https://github.com/EEES0/NoTo

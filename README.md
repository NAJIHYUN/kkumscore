# Scorebox

꿈꾸는교회 중고등부 찬양팀용 악보 관리/공유 웹앱입니다.

## 주요 기능
- 악보 목록 검색 (한글/영문/초성)
- 악보 선택, 순서 변경, 패키지 링크 생성
- 공유 페이지에서 전체/선택 페이지 PDF 병합 및 공유
- 보관함(고등부/중등부/기타)별 패키지 저장
- Supabase Auth 기반 로그인 + 승인(`approved`) 정책

## 기술 스택
- Vanilla HTML/CSS/JS
- [Supabase](https://supabase.com/) (Auth + Postgres)
- `pdf.js`, `pdf-lib`

## 프로젝트 구조
- `index.html` / `app.js`: 메인 악보 목록
- `share.html` / `share.js`: 공유 패키지 페이지
- `vault-*.html` / `vault.js`: 보관함 페이지
- `auth.html` / `auth.js`: 로그인/회원가입
- `songs.json`: 악보 메타데이터
- `files/`: 실제 악보 파일(PDF/JPG)
- `supabase/schema.sql`: DB/RLS 초기 스키마
- `supabase/SETUP.md`: Supabase 설정 가이드

## 로컬 실행
정적 서버로 실행해야 합니다.

예시:
```bash
cd /Users/jihyun/Desktop/scorebox
python3 -m http.server 5500
```

브라우저에서:
- `http://localhost:5500/index.html`

## Supabase 설정
1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. `supabase-config.js`에 `url`, `anonKey` 입력
4. 회원가입 후 `profiles.approved = true`로 승인해야 로그인 가능
5. 기존 프로젝트라면 `supabase/schema.sql`을 다시 실행해 `songs.uploader_nickname` 컬럼 추가

## 권한/정책 요약
- `packages` 삭제: 본인 생성 항목만 가능 (RLS)
- 보관함 저장 권한 분리는 `profiles.role` + RLS 확장으로 적용 가능

## 데이터 형식 (`songs.json`)
각 항목 예시:
```json
{
  "id": "song-001",
  "title": "곡명",
  "artist": "아티스트",
  "key": "G",
  "pdfUrl": "./files/sample.pdf",
  "jpgUrl": "",
  "uploaderNickname": "업로더닉네임",
  "createdAt": "2026-02-21T00:00:00.000Z"
}
```

## 배포 전 체크리스트
- `supabase-config.js`에 `service_role` 키가 없는지 확인
- `songs.json` 경로와 `files/` 파일 누락 여부 확인
- 모바일에서 공유(Web Share API) 동작 점검
- `.gitignore` 적용 (`.DS_Store` 등)

## 라이선스
현재 저장소의 `LICENSE` 파일을 따릅니다.

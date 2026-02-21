# Supabase 시작 가이드

## 1) 프로젝트 생성
1. Supabase에서 새 프로젝트를 생성합니다.
2. Project URL, anon public key를 복사합니다.

## 2) SQL 적용
1. Supabase SQL Editor를 엽니다.
2. `supabase/schema.sql` 내용을 실행합니다.

## 3) 프론트 설정
1. `supabase-config.js` 파일을 열어 아래 값을 입력합니다.

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_ANON_PUBLIC_KEY",
};
```

## 4) 권한 승인
- 회원가입한 사용자는 `profiles.approved = false` 상태입니다.
- Supabase Table Editor에서 `profiles` 테이블의 `approved`를 `true`로 바꿔야 로그인 가능합니다.
- `role`은 `high`, `middle`, `all`, `admin` 중 하나를 사용합니다.

## 5) 동작 요약
- 로그인 세션은 브라우저에 유지됩니다.
- 패키지 생성 시 `packages` 테이블에 저장됩니다.
- 보관함 페이지는 Supabase 우선 조회, 실패 시 localStorage fallback.

## 6) 주의
- 정적 배포 환경에서 CORS/도메인 설정이 필요할 수 있습니다.
- Auth URL 설정(redirect URL)은 배포 도메인 기준으로 추가하세요.

# 돈워리 (Don't Worry)

고령자의 보이스피싱 위험을 감지하고 보호자와 공동 대응하는 금융 안전 서비스 MVP입니다.

## 저장소 구조

```text
apps/
├── android/  # Kotlin 네이티브 앱과 기술 스파이크
├── api/      # NestJS 모듈형 모놀리스
└── web/      # Next.js 보호자·심사위원 웹앱
packages/
├── contracts/          # 공통 enum·API 계약
├── risk-engine/        # 결정적 위험 판정
├── eslint-config/      # 공통 ESLint 설정
└── typescript-config/  # 공통 TypeScript 설정
```

## 요구 환경

- Node.js 22
- pnpm 11.17.0
- Android Studio와 JDK 21
- Docker Desktop 또는 호환 Docker runtime

Corepack이 없는 환경에서는 고정된 pnpm 버전을 `npx`로 실행할 수 있습니다.

```bash
npx --yes pnpm@11.17.0 install
npx --yes pnpm@11.17.0 infra:up
npx --yes pnpm@11.17.0 db:migrate
npx --yes pnpm@11.17.0 build
```

pnpm을 설치한 환경의 기본 명령은 다음과 같습니다.

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

API 기본 주소는 `http://localhost:4000`, 웹은 `http://localhost:3000`입니다. API 문서는
`http://localhost:4000/docs`, OpenAPI JSON은 `http://localhost:4000/openapi.json`에서
확인합니다.

Android 스파이크 검증 방법은 [apps/android/README.md](apps/android/README.md), 제품·기술
문서 기준은 [docs/README.md](docs/README.md)를 참고합니다.

## Container와 배포

```bash
pnpm docker:build:api
pnpm docker:build:web
pnpm db:restore:verify
```

두 image는 non-root 사용자, health check, production dependency만 포함합니다. Render
Singapore 배포 구성은 [`render.yaml`](render.yaml), 실제 계정 연결·secret 입력·검증
순서는 [Render 배포 가이드](docs/deployment-render.md)를 따릅니다. 유료 resource 생성은
팀의 비용 승인 후 진행합니다.

## 현재 구현 상태

- Android API 29·36 에뮬레이터 기술 스파이크 완료
- pnpm 모노레포, NestJS API, Next.js 웹, 공통 패키지 기반 구성
- PostgreSQL·Prisma·OpenAPI·CI 기반 구성
- 보호자 인증·대상자 활성화·동의 API 수직 흐름
- 결정적 RiskEngine, 위험 이벤트·사건·체크리스트·PostgreSQL outbox
- 보호자 로그인·우선순위 대시보드·사건 상세·Web Push 등록 화면
- Android 6자리 활성화·Keystore credential·공유/붙여넣기 로컬 판정·특징 동기화
- Android 통화 후 8항목 설문·S0~S4 재판정·단계별 대응 체크리스트
- 선택형 OpenAI 설명 adapter·strict schema·1.5초 timeout·template fallback
- 운영 API·DB·FCM과 격리된 로그인 없는 `/demo` 6개 합성 시나리오
- 동일 fixture를 재계산해 분모와 실패 case를 표시하는 `/demo/evaluation`
- optional Sentry API·Web adapter와 PII event scrubber, Render Blueprint·Docker image
- Samsung Android 14+ 실기기 자동 감지 gate 대기
- Firebase 실제 인증·FCM, 외부 URL 평판, OpenAI 모델 품질의 staging 검증 대기

실제 구현 상태는 [기능명세서](docs/기능명세서.md)에 `NOT_STARTED`, `IN_PROGRESS`,
`VERIFIED`, `DROPPED`로 기록합니다.

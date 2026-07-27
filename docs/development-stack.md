# 돈워리 MVP 개발 스택

> 상태: MVP 구현 기준안
>
> 최종 갱신: 2026-07-27
>
> 관련 문서: [문서 인덱스](README.md) · [인프라 아키텍처](infrastructure-architecture.md) · [위험 판정](risk-spec.md) · [백엔드 사양](backend-spec.md) · [PRD](../PRD.md)

## 1. 선택 기준

기술은 한 언어로 통일하는 것이 아니라 프로젝트 완주 가능성을 기준으로 선택합니다.

1. Android 시스템 기능은 네이티브 API를 직접 사용합니다.
2. 웹과 제품 백엔드는 TypeScript로 통일합니다.
3. 운영 서비스 수를 최소화합니다.
4. 인증·푸시·배포처럼 이미 해결된 문제는 관리형 서비스를 사용합니다.
5. LLM은 판정 엔진이 아닌 교체 가능한 설명 adapter로 둡니다.
6. 최신 버전보다 안정적인 정식 버전과 재현 가능한 lockfile을 우선합니다.
7. P0 경로에는 테스트·fallback·관찰성을 구현과 동시에 포함합니다.

## 2. 최종 스택

| 영역 | 채택 기술 | 상태 |
|---|---|:---:|
| Android 언어 | Kotlin | 확정 |
| Android UI | Jetpack Compose | 확정 |
| Android 구조 | ViewModel + Repository + 명시적 state | 확정 |
| Android DI | Hilt | 확정 |
| Android 로컬 저장 | Room | 확정 |
| Android 네트워크 | Retrofit + OkHttp | 확정 |
| Android 직렬화 | Kotlinx Serialization | 확정 |
| Android 백그라운드 재전송 | WorkManager | 확정 |
| 웹 | Next.js App Router + TypeScript | 확정 |
| 웹 스타일 | Tailwind CSS + 디자인 토큰 | 확정 |
| 웹 서버 상태 | TanStack Query | 확정 |
| 웹 폼 | React Hook Form + Zod | 확정 |
| API | NestJS + TypeScript | 확정 |
| HTTP adapter | Express | 확정 |
| API 명세 | REST + OpenAPI | 확정 |
| API client | OpenAPI Generator(Kotlin) + openapi-typescript(Web) | 확정 |
| API 검증 | NestJS ValidationPipe | 확정 |
| ORM | Prisma ORM | 확정 |
| DB | Managed PostgreSQL | 확정 |
| 비동기 재시도 | PostgreSQL outbox + NestJS scheduler | 확정 |
| 보호자 인증 | Firebase Authentication | 확정 |
| 보호자 알림 | FCM Web Push | 확정 |
| URL 평판 | KISA local snapshot + Google Safe Browsing | 확정 |
| 생성형 AI | 공급자 중립 LLM adapter | 확정 |
| 데이터 정제·평가 | Python 선택 사용 | 보조 |
| 로컬 인프라 | Docker Compose PostgreSQL | 확정 |
| 패키지 관리자 | pnpm | 확정 |
| CI/CD | GitHub Actions | 확정 |
| 오류 추적 | Sentry | 확정 |

## 3. 언어 전략

```text
Kotlin
└─ Android OS와 맞닿는 모든 기능

TypeScript
├─ NestJS API
├─ Next.js 웹
├─ 공통 RiskEngine·OpenAPI client
└─ 데이터·데모 도구 대부분

SQL
└─ PostgreSQL schema·index·migration 검토

Python
└─ 운영 경로 밖의 데이터 정제·모델 평가만
```

### 3-1. Kotlin을 사용하는 이유

`NotificationListenerService`, `CallScreeningService`, `Room`, `WorkManager`, 역할·권한 요청과 백그라운드 생명주기를 네이티브로 제어해야 합니다. React Native, Flutter, Capacitor도 이 영역에서는 Kotlin bridge를 요구하므로 MVP에는 계층만 늘어납니다.

### 3-2. TypeScript를 사용하는 이유

NestJS와 Next.js가 다음 계약을 공유할 수 있습니다.

- `RiskLevel`
- `RiskCategory`
- `IncidentStage`
- `IncidentStatus`
- `ShareLevel`
- `AlertThreshold`
- 요청·응답 DTO
- 데모 시나리오 fixture

NestJS에서 OpenAPI 문서를 생성하고, Android는 OpenAPI Generator의 Retrofit client, 웹은 `openapi-typescript` 기반 client를 생성합니다. 생성물은 직접 수정하지 않고 원본 OpenAPI와 생성 명령을 버전 관리합니다.

결정적 점수·강제 규칙은 부작용 없는 `packages/risk-engine`에 두고 NestJS와 웹 데모가 같은 구현을 사용합니다. Android Kotlin 구현은 공유 golden fixture로 동등성을 검증합니다.

### 3-3. Python을 운영 서버에서 제외하는 이유

MVP 서버는 모델 학습보다 인증, 사건 상태, 외부 API, 알림과 데이터 저장이 중심입니다. Python 운영 서비스를 추가하면 배포·로그·health check·타임아웃·계약 관리가 두 배가 됩니다.

Python은 다음 작업에만 허용합니다.

- KISA·공개 사례 데이터 정제
- 합성 데이터 생성
- Recall·Precision·오탐률 계산
- 추후 자체 분류 모델 학습 실험

## 4. 버전 정책

정확한 버전은 scaffolding 시점의 최신 안정 버전을 확인한 뒤 lockfile과 build 파일에 고정합니다.

| 영역 | 정책 |
|---|---|
| Node.js | 사용 중인 Next.js·NestJS가 공통 지원하는 Active LTS |
| pnpm | Corepack으로 버전 고정 |
| Next.js·NestJS | 정식 stable, preview/canary 제외 |
| Kotlin·AGP·Compose | Android Studio stable이 권장하는 호환 조합 |
| JDK | 선택한 AGP가 공식 지원하는 LTS |
| PostgreSQL | 관리형 공급자의 안정 주 버전 |
| Prisma | stable만 사용하고 migration history를 Git에 포함 |
| Python | 사용할 경우 `pyproject.toml`과 lockfile로 고정 |

규칙:

- 제출 2주 전부터 major upgrade를 하지 않습니다.
- `latest` Docker tag를 사용하지 않습니다.
- dependency bot의 major update는 대회 종료 후 검토합니다.
- staging과 production은 동일한 artifact와 migration을 사용합니다.

## 5. Android 스택

### 5-1. 애플리케이션 구성

```text
apps/android/app/src/main/java/.../
├── activation/
├── permissions/
├── home/
├── warning/
├── postcall/
├── incident/
├── settings/
├── core/
│   ├── model/
│   ├── network/
│   ├── database/
│   ├── security/
│   └── designsystem/
└── feature/
    ├── notificationlistener/
    ├── shareinput/
    ├── callscreening/
    ├── localrisk/
    └── sync/
```

MVP에서 Gradle module을 지나치게 세분화하지 않습니다. 처음에는 `app` 단일 module 안에서 package 경계로 시작하고, 빌드 시간이나 의존성 문제가 실제로 발생할 때 module을 분리합니다.

### 5-2. 주요 라이브러리

| 기술 | 역할 |
|---|---|
| Jetpack Compose | 고령자 친화 UI와 명시적 화면 state |
| Navigation Compose | 활성화·경고·설문·사건 화면 이동 |
| ViewModel + StateFlow | 화면 state와 단방향 데이터 흐름 |
| Hilt | Android service·repository 의존성 주입 |
| Room | 최근 이벤트·규칙 snapshot·재전송 queue |
| Retrofit + OkHttp | NestJS REST API |
| Kotlinx Serialization | request·response 직렬화 |
| WorkManager | 네트워크 복구 후 이벤트 재전송 |
| Android Keystore | 기기 자격 증명 암호화 |

### 5-3. Android 구현 원칙

- `CallScreeningService`에서 네트워크와 LLM을 호출하지 않습니다.
- 전화 응답 전에 실행하는 작업은 정규화와 Room index 조회로 제한합니다.
- Android service가 UI state를 직접 소유하지 않습니다.
- 이벤트를 Room에 기록하고 ViewModel이 repository를 통해 관찰합니다.
- 실패한 서버 전송에는 idempotency key를 붙입니다.
- APK 내장 최소 정책과 마지막 정상 정책을 보관하고, WorkManager가 활성화 직후와 24시간마다 서명된 정책 bundle을 갱신합니다.
- 고우선순위 알림 fallback 없이 overlay 기능을 P0 완료로 인정하지 않습니다.
- 모든 위험 화면은 TalkBack label, 큰 글씨, 색 외 텍스트 표현을 포함합니다.

## 6. NestJS API 스택

### 6-1. HTTP와 API 계약

- REST JSON API
- `/v1` prefix
- OpenAPI 문서를 CI에서 생성
- request DTO는 concrete class로 정의
- 전역 `ValidationPipe`에 whitelist와 unknown field 거부 적용
- Android 이벤트 생성 요청에 `Idempotency-Key` 적용
- 모든 오류는 안정적인 `code`, 사용자용 `message`, `correlationId`를 반환

### 6-2. 모듈형 모놀리스

```text
apps/api/src/
├── auth/
├── guardians/
├── subjects/
├── care-connections/
├── devices/
├── consents/
├── risk-events/
├── risk-analysis/
├── reputation/
├── incidents/
├── action-items/
├── notifications/
├── demo/
├── evaluation/
└── health/
```

각 모듈은 controller → application service → repository 방향으로 의존합니다. 다른 모듈의 Prisma query를 직접 호출하지 않고 공개 application service를 사용합니다.

### 6-3. Express를 선택하는 이유

MVP 트래픽은 낮고 외부 API latency와 기기 제약이 주요 병목입니다. Fastify 전환으로 얻는 처리량보다 Express 생태계 호환성과 디버깅 자료가 중요합니다. NestJS adapter 경계는 유지하므로 실제 병목이 확인되면 이후 전환할 수 있습니다.

### 6-4. 인증과 인가

| 주체 | 인증 |
|---|---|
| 보호자 | Firebase ID token |
| 보호 대상자 기기 | 활성화 후 발급한 device credential |
| 심사위원 데모 | 익명 제한 세션 |
| 관리자 | 보호자와 분리된 admin claim |

인가 규칙:

- 대상자와 사건 접근은 활성 `CareConnection`이 있어야 합니다.
- 공유 수준보다 많은 데이터를 응답하지 않습니다.
- 동의 철회 즉시 새 알림과 상세 응답에 반영합니다.
- demo scope는 production 사용자 테이블을 조회할 수 없습니다.

### 6-5. 외부 adapter

```ts
interface UrlReputationProvider {
  check(url: NormalizedUrl, signal?: AbortSignal): Promise<ReputationResult>;
}

interface ExplanationProvider {
  explain(input: ExplanationInput): Promise<ExplanationResult>;
}

interface PushProvider {
  send(message: GuardianNotification): Promise<DeliveryResult>;
}
```

공급자별 SDK와 응답 형식은 adapter 밖으로 노출하지 않습니다. timeout, retry 가능 여부, 오류 분류를 공통 결과로 변환합니다.

## 7. 웹 스택

### 7-1. Next.js 역할

하나의 Next.js 앱이 route group으로 보호자 화면과 데모 화면을 분리합니다.

```text
apps/web/app/
├── (auth)/
│   └── login/
├── (guardian)/
│   ├── dashboard/
│   ├── subjects/
│   ├── incidents/
│   └── settings/
└── demo/
    ├── scenarios/
    ├── analysis/
    └── evaluation/
```

### 7-2. 상태 관리

| 상태 종류 | 도구 |
|---|---|
| 서버 데이터 | TanStack Query |
| URL에서 복원 가능한 필터 | search params |
| 로컬 폼 | React Hook Form |
| schema 검증 | Zod |
| 짧은 화면 UI state | React state |

전역 상태 라이브러리는 도입하지 않습니다. 서버 데이터와 UI state를 한 store에 섞지 않습니다.

### 7-3. 실시간성과 푸시

- CRITICAL: FCM Web Push가 보호자에게 알립니다.
- 열린 대시보드: 화면이 활성 상태일 때만 5초 polling으로 갱신합니다.
- 위험 이벤트 웹 실시간 스트림은 P1입니다.
- service worker 등록 실패 시 대시보드 내 알림과 설정 안내를 제공합니다.

### 7-4. 접근성과 반응형

- 보호자 웹은 모바일 우선으로 설계합니다.
- 사건 첫 화면에 위험 유형·발생 시각·행동 신호·현재 상태를 표시합니다.
- `tel:` 링크로 바로 전화하기를 제공합니다.
- 색상만으로 위험도를 표현하지 않습니다.
- 키보드 탐색, focus, screen reader label을 기본 완료 조건에 포함합니다.

### 7-5. 공개 데모 격리

- 데모 시나리오는 빌드에 포함된 불변 JSON fixture입니다.
- 진행 상태는 브라우저 `sessionStorage`에만 두며 최대 24시간 후 만료합니다.
- 데모 route는 `packages/risk-engine`만 사용하고 운영 API client, Prisma, Firebase Admin을 import하지 않습니다.
- 푸시와 외부 평판 응답은 합성 상태로 표시하고 실제 FCM·외부 API를 호출하지 않습니다.
- 이 경계는 feature flag가 아니라 import·dependency test와 E2E로 검증합니다.

## 8. 데이터베이스와 migration

### 8-1. PostgreSQL

PostgreSQL을 선택하는 이유:

- 다대다 보호자 관계
- 명시적인 동의와 상태 이력
- 위험 이벤트와 사건 transaction
- outbox와 idempotency unique constraint
- 정렬·필터에 필요한 복합 index

### 8-2. Prisma

- Prisma schema와 전체 migration history를 Git에 포함합니다.
- 개발에서는 migration 생성 후 SQL을 검토합니다.
- staging·production에는 비대화형 deploy 명령만 사용합니다.
- production에 적용된 migration 파일을 수정하거나 삭제하지 않습니다.
- 복합 index, check constraint와 DB 기능은 custom SQL migration을 허용합니다.
- N+1을 숨길 수 있는 무제한 relation include를 금지합니다.

### 8-3. PostgreSQL outbox

초기에는 Redis와 BullMQ를 사용하지 않습니다.

```text
transaction:
  update incident
  insert notification_outbox(dedupe_key, payload_ref, PENDING)

scheduler:
  claim due rows with SKIP LOCKED + 30s lease
  send FCM
  mark SENT or reschedule
```

MVP production은 NestJS API 단일 인스턴스에서 `WORKER_ENABLED=true`로 scheduler를 함께 실행합니다. 최대 6회(`0초·5초·30초·2분·10분·30분`) 재시도하고 만료된 PROCESSING lease를 복구합니다. 전달 보장은 exactly-once가 아니라 at-least-once이므로 `dedupe_key`와 안정적인 `notificationId`를 사용하고 service worker·웹 알림함이 표시 중복을 제거합니다.

단일 인스턴스부터 `FOR UPDATE SKIP LOCKED`로 한 작업을 하나의 worker만 선점합니다. 인스턴스를 늘리면 같은 계약으로 worker만 별도 process로 분리합니다. FCM 성공 직후 DB 기록 전에 process가 종료되는 재전송 시나리오를 integration test에 포함합니다.

## 9. AI와 데이터 도구

### 9-1. 위험 판정

```text
정확 일치 데이터
  → 결정적 규칙
  → URL 평판
  → 문자–전화 연관
  → 행동 신호
  → 위험 수준·근거 확정
  → LLM 설명
  → 출력 schema·안전 필터
```

위험 수준은 LLM 호출 전 확정합니다. LLM 출력은 위험 수준, 점수, 알림 여부를 바꿀 수 없습니다.
점수 구간, 강제 규칙, `UNKNOWN`·`FINALIZED_PARTIAL` 처리와 `PROVISIONAL`→`FINAL` 전이는 [위험 판정 사양](risk-spec.md)을 단일 기준으로 사용합니다. Android와 NestJS 양쪽에서 같은 golden fixture를 실행해 결과 불일치를 CI에서 차단합니다.

### 9-2. Python 선택 사용

```text
tools/data/
├── pyproject.toml
├── prepare_kisa.py
├── generate_fixtures.py
├── evaluate_predictions.py
└── tests/
```

Python 도구를 추가할 때는 운영 배포 image에 포함하지 않습니다. 입력 데이터 출처, 라이선스, checksum, 생성 명령과 출력 버전을 기록합니다.

### 9-3. 평가

- 위험 fixture에는 기대 위험 수준과 필수 근거를 포함합니다.
- 학습·threshold 조정에 쓴 데이터와 최종 test 데이터를 분리합니다.
- LLM 설명은 사실 근거, 쉬운 한국어, 금지 표현, 행동 지침으로 평가합니다.
- 제출 문서에는 목표치가 아니라 실제 측정 결과만 기록합니다.

## 10. 테스트 스택

| 영역 | 단위·통합 | UI·E2E |
|---|---|---|
| Android | JUnit, kotlinx-coroutines-test, Room in-memory, MockWebServer | Compose UI Test, Android instrumented test, Samsung 실기기 |
| NestJS | Jest, Supertest, Testcontainers PostgreSQL | API critical-flow test |
| Next.js | Vitest, Testing Library, MSW | Playwright |
| 계약 | OpenAPI schema diff, generated client compile | Android↔API staging smoke |
| AI | golden fixture, adapter contract | 설명 품질 eval |
| 인프라 | migration dry-run, health check | staging smoke·장애 주입 |

### 10-1. 테스트 원칙

- 순수 위험 규칙은 모든 분기와 경계값을 테스트합니다.
- 신규 domain·application service의 실행 분기는 100% 테스트를 목표로 합니다.
- 외부 API는 성공, timeout, 4xx, 5xx, malformed response를 테스트합니다.
- 인증·동의·데이터 삭제·demo 격리는 E2E로 검증합니다.
- 버그 수정에는 재현 테스트를 먼저 추가합니다.
- 실기기 검증을 emulator 테스트로 대체하지 않습니다.
- P0 기능은 테스트 없이 완료 처리하지 않습니다.

## 11. 모노레포 구조

```text
ai-challenge/
├── apps/
│   ├── android/             # Gradle
│   ├── api/                 # NestJS
│   └── web/                 # Next.js
├── packages/
│   ├── api-client/          # generated TypeScript client
│   ├── contracts/           # 공통 enum·schema
│   ├── risk-engine/         # API·웹 데모의 순수 판정 구현
│   ├── eslint-config/
│   └── typescript-config/
├── tools/
│   ├── data/
│   └── evaluation/
├── infra/
│   ├── docker-compose.yml
│   └── docker/
├── docs/
├── pnpm-workspace.yaml
└── package.json
```

Android는 pnpm workspace의 package가 아니지만 같은 저장소에서 문서·API 계약·CI·release tag를 공유합니다.

## 12. 개발 환경과 명령 규약

scaffolding 후 루트 명령을 다음 의미로 통일합니다.

```text
pnpm dev             # web + api
pnpm lint            # TypeScript lint
pnpm typecheck       # web + api type
pnpm test            # web + api unit
pnpm test:integration
pnpm test:e2e
pnpm openapi:generate
pnpm db:migrate
pnpm db:seed

./gradlew lint
./gradlew test
./gradlew connectedCheck
./gradlew assembleDebug
./gradlew assembleRelease
```

루트 README에는 한 번에 실행 가능한 local setup, 필요한 secret 목록, 테스트 계정과 합성 seed 절차를 기록합니다.

## 13. 코드 품질 규칙

### 13-1. 공통

- 명시적인 enum과 상태 전이를 사용합니다.
- 날짜는 저장·API에서 UTC ISO 8601을 사용하고 화면에서 Asia/Seoul로 표시합니다.
- 전화번호와 URL은 비교 전에 한 번만 정규화합니다.
- 오류를 문자열 비교로 분기하지 않고 안정적인 error code를 사용합니다.
- 개인정보는 로그 인자에 전달되기 전에 redaction합니다.

### 13-2. TypeScript

- strict mode
- 공개 함수와 adapter 경계에 명시적 반환형
- `any` 금지, 외부 입력은 `unknown`에서 검증
- controller에 비즈니스 규칙 작성 금지
- Prisma model을 그대로 API 응답으로 반환하지 않음
- OpenAPI와 runtime validation이 같은 DTO를 사용

### 13-3. Kotlin

- UI는 immutable state와 단방향 event 처리
- service callback에서 blocking I/O 금지
- coroutine dispatcher를 명시
- sealed type으로 화면·네트워크 결과 표현
- background event는 idempotent하게 처리
- Android framework object를 domain layer로 전달하지 않음

## 14. Secret과 설정

| Secret | 저장 위치 |
|---|---|
| Database URL | API runtime secret |
| Firebase Admin credential | API runtime secret |
| Firebase web config | 공개 가능한 client config, 권한은 서버 규칙으로 통제 |
| Safe Browsing key | API runtime secret |
| LLM API key | API runtime secret |
| Android signing key | CI encrypted secret + 오프라인 백업 |
| Device credential | Android Keystore |

규칙:

- `.env.example`에는 이름과 설명만 기록합니다.
- 실제 secret을 Git, APK resource, Next.js public env에 넣지 않습니다.
- staging과 production secret을 분리합니다.
- 로그·오류 추적에 Authorization header를 전송하지 않습니다.
- 제출 종료 후 외부 API key와 데모 계정을 회전합니다.

## 15. 관찰성과 운영 도구

P0 관찰성:

- API 구조화 로그와 correlation ID
- Android·웹·API 오류 추적
- `/health/live`, `/health/ready`
- 공개 웹과 API uptime check
- FCM outbox 실패 대시보드 또는 admin query
- 배포 version과 rule/model version 표시

OpenTelemetry collector와 별도 metrics cluster는 MVP 범위에서 제외합니다. 관리형 오류 추적과 공급자 기본 metrics로 시작합니다.

## 16. 채택하지 않는 대안

| 대안 | 제외 이유 | 재검토 조건 |
|---|---|---|
| Python/FastAPI 주 백엔드 | 웹과 언어가 갈리고 자체 모델 추론이 없음 | GPU·Python 모델 서버가 실제 P0가 될 때 |
| Fastify | 현재 트래픽에서 이득보다 호환성 검증 비용이 큼 | 부하 측정에서 HTTP adapter가 병목일 때 |
| Redis + BullMQ | 서비스·장애 지점이 하나 더 생김 | outbox 처리량·예약 작업이 DB 운영 한계를 넘을 때 |
| React Native | OS 핵심 기능에 Kotlin bridge 필요 | 네이티브 기능이 축소되고 화면 재사용 이득이 커질 때 |
| Flutter | 동일하게 platform channel이 필요 | 전담 모바일 인력이 생길 때 |
| Capacitor/PWA-only | 일반 문자·전화 이벤트를 직접 받을 수 없음 | 수동 검사 서비스로 제품 범위를 바꿀 때 |
| GraphQL | Android·웹 계약과 캐시가 P0에 비해 복잡 | 다수 클라이언트의 선택적 복합 조회가 늘어날 때 |
| WebSocket | 운영 연결 관리가 필요 | 실시간 사건 타임라인이 검증된 P0가 될 때 |
| Microservices | 개발·배포·관찰성 비용 증가 | 팀과 트래픽이 실제로 확장될 때 |
| Kubernetes | 단일 API·웹에 과도함 | 다수 서비스·리전·운영팀이 생길 때 |

## 17. 도입 순서

1. Android 기술 스파이크
2. pnpm workspace, NestJS, Next.js, Android scaffolding
3. PostgreSQL, Prisma migration, OpenAPI, CI
4. 보호자 인증과 대상자 활성화
5. 문자 입력부터 보호자 대시보드까지 수직 슬라이스
6. 전화 스크리닝과 문자–전화 연관
7. 통화 후 설문, 사건, outbox, FCM
8. 심사위원 데모와 평가
9. 장애 복구, 보안, APK 서명과 운영 점검

## 18. Definition of Done

기술 선택은 다음이 충족되어야 완료된 것으로 봅니다.

- stable 버전과 lockfile이 저장소에 고정됨
- local setup이 새 환경에서 재현됨
- Android 실기기 스파이크 결과가 문서화됨
- OpenAPI가 생성되고 Android·웹 client가 계약을 통과함
- migration이 빈 DB와 staging DB에서 성공함
- 핵심 E2E 6개가 CI 또는 staging에서 반복 성공함
- 외부 API와 FCM 실패 fallback이 검증됨
- production secret, 로그 redaction, 데이터 삭제 경로가 검증됨
- 공개 웹 URL, API health, 서명 APK가 release artifact로 보관됨

## 19. 공식 참고 문서

- [Android NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
- [Android CallScreeningService](https://developer.android.com/reference/android/telecom/CallScreeningService)
- [NestJS 공식 문서](https://docs.nestjs.com/)
- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [OpenAPI Generator](https://openapi-generator.tech/)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Prisma ORM](https://www.prisma.io/docs/orm)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [Google Safe Browsing API](https://developers.google.com/safe-browsing/reference/rest)

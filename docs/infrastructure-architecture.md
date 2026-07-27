# 돈워리 MVP 인프라 아키텍처

> 상태: MVP 구현 기준안
>
> 최종 갱신: 2026-07-27
>
> 대상 독자: 풀스택 개발자, 기획·디자인 담당자, 기술 심사위원
>
> 관련 문서: [문서 인덱스](README.md) · [PRD](../PRD.md) · [위험 판정](risk-spec.md) · [백엔드 사양](backend-spec.md) · [개인정보·보안](privacy-security.md) · [개발 스택](development-stack.md)

## 1. 결정 요약

돈워리는 단일 웹앱이 아니라 다음 세 실행 환경으로 구성합니다.

1. 보호 대상자 휴대전화에서 OS 이벤트를 감지하는 **네이티브 Android 앱**
2. 인증·위험 판정·사건·알림을 담당하는 **NestJS 모듈형 모놀리스**
3. 생활지원사와 심사위원이 사용하는 **Next.js 웹앱**

MVP에서는 운영 복잡도를 줄이기 위해 마이크로서비스, Redis, BullMQ, 별도 Python 추론 서버를 사용하지 않습니다. 재시도가 필요한 알림 작업은 PostgreSQL outbox와 NestJS worker로 처리합니다.

```text
Android 네이티브 앱
  Kotlin + Compose
  ├─ 알림 접근
  ├─ 전화 스크리닝
  ├─ 로컬 1차 판정
  └─ 위험 경고·통화 후 설문
             │
             │ HTTPS / JSON
             ▼
NestJS 모듈형 모놀리스
  ├─ 보호자·대상자·동의
  ├─ 위험 판정
  ├─ URL 평판
  ├─ 사건·대응 체크리스트
  ├─ LLM 설명
  └─ 알림 outbox worker
             │
             ├──────────► Firebase Cloud Messaging
             │
             ├──────────► KISA 로컬 데이터
             │
             ├──────────► Google Safe Browsing
             │
             └──────────► LLM API
             │
             ▼
       Managed PostgreSQL
             ▲
             │ HTTPS / JSON
             │
Next.js 웹앱
  ├─ 생활지원사 1:25 대시보드
  ├─ 사건 대응·업무 이력
  └─ 심사위원 공개 데모
```

## 2. 배경과 제약

### 2-1. 팀과 일정

| 항목 | 제약 |
|---|---|
| 팀 | 풀스택 개발자 1명 + 기획·디자인 1명 |
| 개발 가능 시간 | 개발자 주 20시간 이상 |
| 개발 기간 | 약 6주 |
| MVP 제출 | 2026년 9월 7일 오전 10시 |
| 필수 운영 | 2026년 9월 7일 11:00~9월 11일 23:59 |
| Android 배포 | 심사용 서명 APK 직접 설치 |
| 웹 배포 | 심사위원이 설치 없이 접속할 수 있는 공개 HTTPS URL |

### 2-2. 제품 제약

- 보호 대상자는 혼자 사는 65세 이상 금융 이용자입니다.
- 보호자는 가족으로 한정하지 않고 생활지원사·복지관 담당자·친지 등을 포함합니다.
- 생활지원사 한 명이 20~25명의 보호 대상자를 관리할 수 있어야 합니다.
- 보호 대상자는 이메일 회원가입이나 본인인증을 하지 않습니다.
- 통화 음성, 전체 연락처, 계좌정보는 수집하지 않습니다.
- LLM은 최종 위험도를 결정하지 않고 설명과 사건 요약만 생성합니다.
- 웹만으로는 일반 문자 알림과 전화 착신 이벤트를 감지할 수 없으므로 Android 네이티브 앱이 필수입니다.
- `CallScreeningService`는 수신 전화에 5초 안에 응답해야 하므로 통화 허용·무음·차단 판단이 네트워크에 의존해서는 안 됩니다.

### 2-3. 이미 있는 자산

| 자산 | 재사용 방식 |
|---|---|
| `PRD.md` | 사용자 역할, P0 요구사항, 점수 가중치, 데이터 보존과 예외 흐름의 요구사항 원본 |
| `docs/기획서.md` | 문제 정의, 차별성, 문자–전화 연관과 공동대응의 제품 근거 |
| `docs/user-research.md` | 1:25 대시보드, 고령자 UX, 공유 수준의 설계 입력 |
| `docs/alert-policy.md` | 위험도별 대상자 경고와 보호자 알림의 기준 문서 |
| `SCHEDULE.md` | 6주 일정과 담당 시간의 상한 |

현재 저장소에는 애플리케이션·인프라 구현 코드가 없습니다. 위 자산의 계약과 용어를 재사용하고, scaffolding 단계에서 이 문서를 코드 구조와 테스트의 기준으로 삼습니다.

## 3. 목표와 비목표

### 3-1. 아키텍처 목표

- 문자·URL·전화 이벤트에 첫 경고를 3초 이내 제공합니다.
- 네트워크 또는 외부 API 장애 시에도 로컬 경고와 데모가 작동합니다.
- CRITICAL 사건을 사전 동의된 보호자에게 최소 1회 전달하도록 재시도하고, 동일 알림은 수신 측에서 중복 제거합니다.
- 보호자가 25명 중 누구부터 확인해야 하는지 즉시 판단할 수 있게 합니다.
- 위험 판정의 입력, 규칙 버전, 근거와 결과를 추적할 수 있게 합니다.
- 개인정보 원문보다 위험 특징과 최소 메타데이터를 저장합니다.
- 개발자 한 명이 배포·복구·운영할 수 있는 구성으로 제한합니다.

### 3-2. 비목표

- 모든 보이스피싱 자동 차단
- 통화 음성 녹음·STT·실시간 대화 분석
- 금융 앱 송금 또는 타 앱 강제 제어
- Google Play 정식 출시
- 금융기관·통신사 실거래 연동
- 자체 LLM 학습과 GPU 추론
- 다중 리전, 자동 확장, Kubernetes
- 대규모 기관의 조직·근무표·교대근무 관리

## 4. 상위 문서 간 충돌 해소

PRD, 기획서, `alert-policy.md`, 일정에 다른 표현이 있는 경우 MVP 구현은 아래 결정을 따릅니다. 상위 문서를 갱신할 때도 같은 결정을 반영해야 합니다.

| 항목 | 구현 결정 |
|---|---|
| 보호 대상자 인증 | 보호자는 로그인하지만 보호 대상자는 로그인 계정을 만들지 않습니다. 보호자가 대상자 프로필과 6자리 코드를 만들고, 대상자 기기에서 연결·권한·동의를 승인합니다. |
| 보호자 관계 명칭 | `FamilyConnection` 대신 `CareConnection`을 사용합니다. 관계 유형은 `CARE_WORKER`, `WELFARE_STAFF`, `RELATIVE`, `NEIGHBOR`, `CHILD`입니다. |
| 1:25 구조 | 한 보호자는 여러 대상자를 담당합니다. P0는 대상자당 보호자 1명이며 P1에서 최대 3명으로 확장합니다. |
| 문자–전화 연관 분석 | 핵심 데모와 차별성에 필요한 P0 기능으로 취급합니다. |
| 자동 보호자 알림 | 기본값은 명시적으로 동의한 연결의 CRITICAL 자동 알림입니다. `꼼꼼하게` 프리셋은 HIGH부터 자동 알림할 수 있고, HIGH·CAUTION·UNKNOWN은 대상자가 직접 확인을 요청할 수도 있습니다. SAFE는 알림하지 않습니다. |
| 보호자 없음 | 앱의 탐지·경고·대응 안내는 유지하고 112·1332·공식기관 확인 경로를 제공합니다. |
| 전체화면 경고 | P0는 고우선순위 알림을 보장하고 사용자가 경고 Activity로 진입할 수 있게 합니다. OS가 허용하는 전체화면·오버레이 동작은 실기기 검증 후에만 사용합니다. |
| NestJS HTTP adapter | PRD의 Fastify 대신 초기에는 Express를 사용합니다. 트래픽보다 SDK·middleware 호환성과 디버깅 속도가 중요하며 adapter 경계는 유지합니다. |
| 비동기 인프라 | 초기에는 Redis·BullMQ 대신 PostgreSQL outbox를 사용합니다. |
| 경량 분류 모델 | P0 위험 수준은 규칙·평판·문자–전화 연관·행동 신호로 결정합니다. 별도 분류 API는 평가 데이터에서 실질적인 개선이 입증될 때만 추가합니다. |
| Android FCM | 보호 대상자 Android의 즉시 경고는 로컬 알림입니다. FCM은 보호자 웹 푸시에만 사용합니다. |
| 30분 보호 모드 | 핵심 수직 흐름 완주를 위해 P1로 내립니다. P0는 현재 사건의 경고·확인·대응 추적까지만 구현합니다. |
| 일정의 Redis·users·families 표기 | `SCHEDULE.md`의 Redis 작업은 PostgreSQL outbox로, `users/`·`families/`는 `guardians/`·`subjects/`·`care-connections/`로 대체합니다. |

## 5. 설계 원칙

### 5-1. 로컬 우선, 서버 최종화

- 전화 스크리닝과 즉시 경고는 로컬 데이터와 규칙으로 판단합니다.
- 서버는 URL 평판, 문자–전화 연관성, 사건 통합과 설명 생성을 담당합니다.
- 네트워크 실패가 통화 수신을 지연시키거나 로컬 경고를 막아서는 안 됩니다.

### 5-2. 하나의 제품 백엔드

NestJS를 모듈형 모놀리스로 운영합니다. 인증, 위험 판정, 사건, 알림을 논리적으로 분리하되 한 애플리케이션과 한 데이터베이스로 배포합니다.

### 5-3. 설명과 판정 분리

규칙·평판·행동 신호가 위험 수준을 결정합니다. LLM은 이미 결정된 신호를 쉬운 문장으로 변환하며, 실패하면 사전 작성된 템플릿을 반환합니다.

### 5-4. 원문보다 특징

- 원문 서버 분석 동의가 없으면 Android가 추출한 특징과 평판 조회에 필요한 URL·발신번호만 전송합니다. 조회 원문은 요청 처리 후 폐기합니다.
- 동의가 있더라도 원문은 메모리에서 처리하고 기본적으로 저장하지 않습니다.
- 로그, 오류 추적, 분석 도구에 문자 원문과 전체 전화번호를 기록하지 않습니다.

### 5-5. 안전한 실패

- 판단할 수 없으면 SAFE가 아니라 UNKNOWN을 반환합니다.
- 외부 서비스가 실패하면 로컬 규칙과 캐시 결과로 낮은 확신의 임시 결과를 제공합니다.
- 알림 전송이 실패해도 사건은 대시보드에 남고 재시도됩니다.

### 5-6. 하나의 판정 구현

NestJS와 웹 데모는 부작용 없는 TypeScript `packages/risk-engine`을 함께 사용합니다. Android 로컬 정책은 Kotlin으로 별도 구현하되 같은 버전형 정책 bundle과 golden fixture를 실행해 결과 차이를 CI에서 검출합니다.

## 6. 시스템 컨텍스트

```text
┌──────────────────┐
│ 보호 대상자      │
│ Android 사용자   │
└────────┬─────────┘
         │ 권한·동의, 경고 확인, 통화 후 설문
         ▼
┌──────────────────┐       위험 알림·사건 확인       ┌──────────────────┐
│ Android 보호 앱  │ ─────────────────────────────► │ 보호자 웹앱      │
└────────┬─────────┘                                 │ 생활지원사·친지  │
         │                                           └────────┬─────────┘
         │ 이벤트·분석 요청                                  │ 대응·상태 갱신
         ▼                                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    돈워리 NestJS API                         │
└────────┬─────────────────┬─────────────────┬────────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌──────────────┐   ┌──────────────┐   ┌────────────────────┐
│ PostgreSQL   │   │ FCM          │   │ 평판·LLM 외부 API  │
└──────────────┘   └──────────────┘   └────────────────────┘
┌──────────────────┐
│ 심사위원 웹 데모 │──► 합성 fixture + shared RiskEngine
└──────────────────┘     운영 DB·FCM 접근 없음
```

## 7. 배포 토폴로지

```text
                         Internet
                            │
                   ┌────────▼────────┐
                   │ HTTPS / DNS     │
                   └───────┬─────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────▼─────────┐      ┌────────▼─────────┐
     │ Managed Web      │      │ Container Runtime│
     │ Next.js          │      │ NestJS API       │
     │ guardian + demo  │      │ + outbox worker  │
     └────────┬─────────┘      └───────┬──────────┘
              │                        │ private TLS
              └────────────┬───────────┤
                           │           ▼
                           │   ┌──────────────────┐
                           │   │ Managed Postgres │
                           │   │ backup + TLS     │
                           │   └──────────────────┘
                           │
                           └────────► FCM / Safe Browsing / LLM

Android APK
  └─ HTTPS ─────────────────────────► NestJS API
```

논리 아키텍처는 공급자 중립적으로 유지합니다. 실제 공급자는 예산, 무료 구간의 절전·콜드스타트 정책, 서울 리전 지원과 제출 기간의 유료 운영 가능 여부를 확인한 뒤 확정합니다.

## 8. 컴포넌트 책임

### 8-1. Android 보호 앱

| 컴포넌트 | 책임 |
|---|---|
| Activation | 6자리 코드 입력, 기기 등록, 대상자 동의 |
| Permission Center | 알림 접근, 전화 스크리닝, 알림 권한을 단계별 안내 |
| Notification Listener | 허용된 메시지 앱의 알림에서 발신자·본문 후보 추출 |
| Share Receiver | 문자 공유 메뉴와 수동 붙여넣기 입력 |
| Call Screening | 발신번호와 로컬 평판을 조회해 제한 시간 내 통화 처리 |
| Local Safety Policy | 오프라인 1차 위험 판정과 즉시 경고 |
| Local Store | 최근 의심 이벤트, 규칙 버전, 미전송 이벤트 저장 |
| Sync Worker | 실패한 이벤트를 네트워크 복구 후 재전송 |
| Warning UI | 위험 수준, 근거 최대 3개, 한 개의 핵심 CTA 표시 |
| Post-call Survey | 통화 종료 후 행동 신호 수집 |

### 8-2. NestJS 모듈

```text
apps/api/src/
├── auth/                 # 보호자 인증 토큰 검증
├── guardians/            # 보호자 계정·설정
├── subjects/             # 보호 대상자 관리 프로필
├── care-connections/     # 다대다 연결·공유 수준·알림 임계값
├── devices/              # 활성화 코드·기기 자격 증명
├── consents/             # 동의 종류·버전·철회
├── risk-events/          # 문자·전화·URL 이벤트
├── risk-analysis/        # packages/risk-engine orchestration
│   ├── rules/            # 서비스별 정책 입력
│   ├── scoring/          # 위험 점수와 강제 규칙 adapter
│   ├── correlation/      # 문자–전화 시간 연관
│   └── explanation/      # 템플릿·LLM 설명
├── reputation/
│   ├── kisa/             # 로컬 공개 데이터
│   ├── safe-browsing/    # 외부 URL 평판
│   └── phone/            # 공식·신고·데모 번호
├── incidents/            # S0~S4 사건과 상태
├── action-items/         # 대응 체크리스트
├── notifications/        # 정책 평가·outbox·FCM
├── evaluation/           # 데이터셋·모델 결과
└── health/               # readiness/liveness
```

### 8-3. Next.js 웹앱

| 영역 | 책임 |
|---|---|
| 보호자 인증 | 보호자 로그인과 세션 복구 |
| 대상자 등록 | 대상자 프로필 생성과 6자리 코드 발급 |
| 1:25 대시보드 | 위험도·행동 신호·발생 시각·미대응 시간 정렬 |
| 사건 상세 | 첫 화면에서 유형·시각·행동 신호·현재 상태 표시 |
| 대응 | 전화 연결, 체크리스트, 담당 이력과 상태 갱신 |
| 알림 설정 | 보호자별 임계값·공유 범위·웹 푸시 설정 |
| 심사위원 데모 | 로그인 없는 합성 시나리오 재생과 분석 근거 표시 |

### 8-4. PostgreSQL

PostgreSQL은 애플리케이션 데이터, 관계, 동의, 사건 상태, 재시도 작업과 감사 이력의 단일 원본입니다. 데이터베이스 migration은 애플리케이션과 함께 버전 관리합니다.

### 8-5. 외부 서비스

| 서비스 | 사용 목적 | 실패 시 대체 |
|---|---|---|
| Firebase Authentication | 보호자 로그인 | 기존 세션 유지, 신규 로그인 재시도 안내 |
| Firebase Cloud Messaging | 보호자 웹 푸시 | outbox 재시도, 웹 대시보드 사건 유지 |
| KISA 데이터 | 알려진 피싱 URL·유형 | 마지막 성공 버전의 로컬 데이터 |
| Google Safe Browsing | 신규 URL 평판 | KISA·도메인 규칙·UNKNOWN |
| LLM API | 근거 쉬운 문장·사건 요약 | 검증된 템플릿 |
| Sentry | 앱·웹·API 장애 관찰 | 구조화 로그와 health check |

Safe Browsing direct lookup은 userinfo·fragment와 private·loopback·metadata 주소를 제거·차단한 canonical URL만 전송합니다. query가 필요한 경우 제3자 전송 사실과 공급자 처리 조건을 사전 고지하며, `data-sources.md` 승인 전에는 adapter를 production에서 비활성화합니다.

## 9. 핵심 데이터 흐름

### 9-1. 대상자 등록과 기기 활성화

```text
보호자 웹: 대상자 프로필 생성
  → API: 일회용 6자리 코드 발급(10분 만료, 사용 1회)
  → Android: 코드 입력
  → API: 코드 검증
  → Android: 연결 상대·공유 범위·자동 알림 동의 표시
  → 대상자: 기기에서 승인
  → API transaction:
       Device ACTIVE
       CareConnection ACTIVE
       Consent 기록
  → 기기 전용 자격 증명 발급
```

보호 대상자는 이메일·비밀번호·소셜 로그인을 사용하지 않습니다. 활성화 코드는 계정 비밀번호가 아니며 재사용할 수 없습니다.
코드 검증은 기기·IP별 15분에 5회로 제한합니다. 성공 또는 만료된 코드는 즉시 폐기하며, 반복 실패는 구조화된 보안 이벤트로 남깁니다.

### 9-2. 문자 분석

```text
문자 알림 또는 공유 입력
  → Android 입력 정규화·민감정보 마스킹
  → 로컬 규칙 판정
  → 즉시 임시 경고
  → 서버 분석 요청
       ├─ 입력 검증
       ├─ KISA 로컬 조회
       ├─ Safe Browsing 제한 시간 조회
       ├─ 문맥·행동 신호 점수
       ├─ 위험 수준 확정
       └─ LLM 또는 템플릿 설명
  → RiskEvent + RiskSignal 저장
  → Android 최종 결과 갱신
  → CRITICAL이면 알림 outbox 생성
```

Notification Listener에서 본문을 얻지 못하면 실패로 숨기지 않고 공유 메뉴와 붙여넣기 경로를 안내합니다.

### 9-2-1. 최소 수집 이벤트 계약

원문 서버 분석에 동의하지 않아도 Android와 API가 같은 의미를 해석하도록 다음 버전형 계약을 사용합니다.

```json
{
  "schemaVersion": 1,
  "policyVersion": "2026-07-27.1",
  "eventId": "device-generated-uuid",
  "type": "SMS",
  "occurredAt": "2026-07-27T12:00:00Z",
  "sender": {
    "masked": "010-****-1234",
    "normalized": "+821012341234"
  },
  "urls": [
    {
      "canonical": "https://example.invalid/pay?case=fixture",
      "normalizedDomain": "example.invalid",
      "normalizedUrlHash": "sha256"
    }
  ],
  "features": {
    "impersonatedEntityTypes": ["PUBLIC_AGENCY"],
    "riskKeywordIds": ["PAYMENT_REQUEST", "URGENCY"],
    "requestsPayment": true,
    "requestsAppInstall": false,
    "requestsRemoteControl": false,
    "requestsSecret": false,
    "contentAvailable": true,
    "extractionComplete": true,
    "contentTruncated": false,
    "normalizedLength": 52
  },
  "rawText": null
}
```

- `schemaVersion`과 `policyVersion`이 없거나 지원 범위를 벗어나면 추측하지 않고 `UNKNOWN`으로 처리합니다.
- `(deviceId, eventId)`를 unique key로 사용해 재전송을 멱등 처리합니다.
- `rawText`는 별도 원문 서버 분석 동의를 받은 요청에서만 채우고 저장하지 않습니다.
- `sender.normalized`는 TLS 요청에서 번호 평판 조회 후 폐기하며 서버 HMAC hash와 masked 값만 저장합니다.
- `urls[].canonical`은 Safe Browsing direct lookup이 활성화된 요청에서만 전송하고 검증·조회 후 폐기합니다. domain과 hash만 저장합니다.
- 전화 이벤트도 같은 envelope을 사용하되 `type`, 정규화 발신번호, 최근 의심 문자와의 시간 차이만 전송합니다.

### 9-3. 전화 스크리닝

```text
수신 전화
  → CallScreeningService
  → 로컬 Room 조회
       ├─ 공식 번호
       ├─ 데모·신고 번호
       ├─ 최근 의심 문자
       └─ 로컬 규칙 버전
  → 제한 시간 내 allow / silence / demo-only block 응답
  → 경고 Activity 또는 고우선순위 알림
  → 전화 이벤트를 Room에 기록
  → 서버로 비동기 전송
  → 서버에서 문자–전화 연관·최종 점수 계산
```

수신 전화의 1차 허용 여부를 결정하는 경로에서 외부 API나 LLM을 호출하지 않습니다. 자동 차단은 명시적인 심사 데모 번호에만 허용합니다.

### 9-4. 통화 후 설문과 CRITICAL 전환

```text
통화 종료
  → 행동 설문 표시
  → 송금·앱 설치·인증번호·비밀 유지 요구 선택
  → API 위험도 재계산
  → 강제 규칙이 일치하면 CRITICAL
  → Incident 생성 또는 기존 사건 갱신
  → notification_outbox transaction 저장
  → FCM 전송
  → 보호자 웹에서 사건 확인
  → 전화·체크리스트·상태 갱신
```

### 9-5. 심사위원 데모

```text
공개 데모 URL
  → 합성 시나리오 선택
  → 브라우저 sessionStorage에 demoSession 생성
  → 가상 문자·전화·설문 이벤트 순차 실행
  → 동일 RiskEngine 사용
  → 보호자 알림 상태를 “모의 전송”으로 재현
  → S0~S4와 체크리스트 수행
  → 브라우저를 닫거나 24시간이 지나면 삭제
```

공개 데모는 Next.js가 불변 JSON fixture와 순수 `packages/risk-engine`을 브라우저에서 실행합니다. 데모 route는 운영 API client, Prisma, Firebase Admin과 운영 repository를 import하지 않습니다. 데모 상태는 서버 데이터베이스에 저장하지 않고 FCM도 호출하지 않습니다. 외부 API 결과는 합성 fixture로 재현하고 UI에는 실제 발송이 아닌 모의 전송임을 표시합니다.

## 10. 위험 이벤트와 사건 상태

### 10-1. 위험 판정 계약

다음은 [위험 판정 사양](risk-spec.md)의 요약입니다. 상세 입력·점수 그룹·강제 규칙·버전 계약은 해당 문서를 단일 기준으로 사용합니다. 점수 구간은 PRD의 0~100 점수를 구현 가능한 계약으로 만든 **초기 engineering 기준**이며, 최종 제출 전 정상·위험 라벨 데이터로 calibration하고 구간을 바꾸면 `policyVersion`을 올립니다.

| 결과 | 점수·조건 | 사용자·알림 처리 |
|---|---|---|
| `SAFE` | 필수 입력이 충분하고 0~29점 | 일반 안내, 자동 보호자 알림 없음 |
| `CAUTION` | 30~59점 | 확인 행동 안내, 대상자가 일반 확인 요청 가능 |
| `HIGH` | 60~79점 또는 알려진 악성 URL 강제 규칙 | 강한 경고, 기본은 대상자 요청·`꼼꼼하게` 프리셋은 자동 알림 |
| `CRITICAL` | 80~100점 또는 아래 CRITICAL 강제 규칙 | 즉시 경고, 사전 동의 연결에 자동 보호자 알림 |
| `UNKNOWN` | 입력 부족, schema 불일치 또는 판정 불가 | SAFE로 표시하지 않고 수동 확인·보호자 확인 요청·공식기관 경로 안내 |

강제 규칙은 점수보다 우선합니다.

- 금전·송금 요구와 기관 사칭이 함께 있으면 `CRITICAL`
- 앱 설치와 원격 제어 요구가 함께 있으면 `CRITICAL`
- 인증번호·비밀번호 등 비밀정보 요구가 있으면 최소 `HIGH`
- 검증된 악성 URL이 있으면 최소 `HIGH`
- 필수 입력이 부족하면 점수가 낮아도 `SAFE`로 확정하지 않음

Android의 결과는 `PROVISIONAL`, 서버의 결과는 `FINAL`로 구분합니다. 동일 이벤트에서 로컬 강제 규칙이 만든 위험 수준은 서버가 자동으로 낮출 수 없으며, 명시적 사용자 피드백이나 관리자 정정만 하향할 수 있습니다. `FINALIZED_PARTIAL`은 [위험 판정 사양](risk-spec.md#6-unknown과-부분-결과)을 따릅니다. 실패한 외부 조회의 신호만 제외해 다시 계산하며, 남은 근거만으로 충분한 HIGH·CRITICAL은 유지하고 근거가 부족하면 CAUTION 또는 UNKNOWN으로 제한합니다.

피해 단계는 위험 수준과 별개의 사건 상태입니다.

| 단계 | 의미 |
|---|---|
| `S0` | 행동 전. 링크·통화를 중단하고 공식번호를 확인하는 단계 |
| `S1` | 링크 클릭. 다운로드·설치 여부를 확인하는 단계 |
| `S2` | 개인정보 입력. 계정·금융기관 보호 조치를 시작하는 단계 |
| `S3` | 앱 설치. 네트워크를 차단하고 악성 앱을 점검하는 단계 |
| `S4` | 송금 완료. 112 신고와 은행 지급정지를 즉시 진행하는 단계 |

### 10-2. 분석 상태

```text
RECEIVED
   │
   ▼
LOCAL_ANALYZED
   │
   ▼
REPUTATION_CHECKING ──timeout/error──► FINALIZED_PARTIAL
   │
   ▼
FINALIZED
```

분석 완료 후 알림 필요 여부를 평가하되, 전달 상태는 `RiskEvent`에 섞지 않고 별도 `NotificationOutbox`에서 관리합니다.

```text
PENDING ─► PROCESSING ─► SENT
              ├───────► PENDING (backoff retry)
              ├───────► FAILED
              └───────► CANCELLED
```

### 10-3. 사건 상태

```text
OPEN ─► ACKNOWLEDGED ─► IN_PROGRESS ─► RESOLVED
  │                             │
  └──────────────► ESCALATED ◄──┘
```

피해 단계 `S0~S4`와 처리 상태는 별도 필드입니다. 피해 단계가 바뀌어도 사건 처리 이력을 덮어쓰지 않고 변경 이력을 남깁니다.

## 11. 핵심 데이터 모델

| 엔티티 | 핵심 책임 |
|---|---|
| `GuardianAccount` | 로그인 가능한 생활지원사·친지 계정 |
| `SubjectProfile` | 로그인하지 않는 보호 대상자 관리 프로필 |
| `Device` | 대상자 Android 기기와 기기 자격 증명 |
| `CareConnection` | 보호자–대상자 관계, 역할·공유·알림 정책. P0 대상자당 1개 |
| `Consent` | 동의 종류, 문구 버전, 동의·철회 시각 |
| `RiskEvent` | SMS·CALL·URL·MANUAL 이벤트와 분석 상태 |
| `RiskSignal` | 판정 근거, 점수, 출처와 규칙 버전 |
| `RawShareGrant` | P1에서 사건별 승인된 원문을 연결별로 암호화해 15분·1회 공유 |
| `Incident` | 연관 이벤트를 묶은 사건, 피해 단계와 처리 상태 |
| `ActionItem` | 단계별 대응 체크리스트와 담당자 |
| `NotificationOutbox` | 알림 payload 참조, 중복 키, 재시도 상태 |
| `NotificationDelivery` | FCM 응답과 최종 전송 결과 |
| `AuditLog` | 동의·공유 범위·사건 상태 변경 이력 |

### 11-1. 관계

```text
GuardianAccount ──< CareConnection >── SubjectProfile ──< Device
                              │                │
                              │                ├──< Consent
                              │                └──< RiskEvent ──< RiskSignal
                              │                          │
                              │                          ├──< RawShareGrant (P1)
                              │                          ▼
                              └────────────────────── Incident ──< ActionItem
                                                         │
                                                         └──< NotificationOutbox
```

### 11-2. 필수 인덱스

- `risk_events(subject_id, occurred_at desc)`
- `risk_events(status, risk_level, occurred_at desc)`
- `care_connections(guardian_id, status)`
- `care_connections(subject_id, status)`
- `incidents(subject_id, status, updated_at desc)`
- `notification_outbox(status, next_attempt_at)`
- `notification_outbox(dedupe_key unique)`
- P1: `raw_share_grants(connection_id, expires_at)`

## 12. 알림 전달과 재시도

FCM 호출을 비즈니스 transaction 안에서 직접 실행하지 않습니다.
이 구조의 전달 보장은 정확히 한 번이 아니라 **at-least-once**입니다. FCM 성공 직후 worker가 종료되면 같은 메시지가 재전송될 수 있으므로 모든 계층에서 중복을 안전하게 처리합니다.

```text
위험도 확정 transaction
  ├─ RiskEvent / Incident 저장
  └─ NotificationOutbox PENDING 저장
            │
            ▼
NestJS scheduled worker
  → due PENDING 최대 20건 `FOR UPDATE SKIP LOCKED` 선점
  → PROCESSING + 30초 lease
  → 동의·연결 상태 재검증
  → FCM 전송
       ├─ 성공: SENT + NotificationDelivery
       ├─ 일시 오류: 지수 backoff 재시도
       ├─ 영구 오류: FAILED + 토큰 비활성화 후보
       └─ 동의·연결 철회: CANCELLED
```

필수 안전장치:

- `dedupe_key`로 동일 사건·보호자·위험 버전의 중복 알림 방지
- 안정적인 `notificationId`를 payload에 포함하고 service worker와 웹 알림함에서 이미 표시한 ID를 중복 제거
- 전송 직전 동의 철회와 연결 해제 재확인
- 최대 6회, `0초·5초·30초·2분·10분·30분` 시각으로 재시도
- 30초가 지난 PROCESSING lease는 recovery sweep으로 PENDING 복귀
- payload에 문자 원문·계좌정보·전체 전화번호 포함 금지
- CRITICAL 알림 실패 시 대시보드에 전송 실패 표시
- FAILED 수동 재처리는 감사 로그를 남기는 운영 script로만 수행

MVP production은 NestJS API 한 인스턴스에서 `WORKER_ENABLED=true`로 scheduled worker를 함께 실행합니다. 단일 인스턴스에서도 crash recovery를 위해 `FOR UPDATE SKIP LOCKED`와 lease를 사용합니다. 다중 인스턴스 또는 처리량 증가가 필요해질 때 같은 선점 계약을 유지한 채 worker만 별도 process로 분리합니다.

### 12-1. 로컬 안전 정책 배포

APK에는 네트워크 없이 작동하는 최소 정책을 포함합니다. 활성화 직후와 이후 24시간마다 WorkManager가 `GET /v1/risk-policies/current?installedVersion=...`를 확인합니다.

정책 bundle에는 `version`, `issuedAt`, `expiresAt`, `checksum`, `signature`와 규칙 데이터가 포함됩니다. Android는 서명과 checksum을 검증한 뒤 전체 파일을 원자적으로 교체합니다. 실패하면 마지막 정상 버전을 유지하고, 만료까지 도달하면 APK 내장 정책으로 돌아가면서 화면에 정책 갱신 실패를 표시합니다.

기기에는 공식 대표번호의 최소 집합, 고확신 강제 규칙, 최근 이벤트 연관 규칙만 저장합니다. 전체 KISA snapshot과 최신 URL 평판 조회는 서버에 유지합니다.

## 13. 인증·인가·기기 보안

### 13-1. 보호자

- 관리형 인증을 사용하며 직접 비밀번호와 refresh token을 저장하지 않습니다.
- NestJS는 공급자가 서명한 ID token을 검증하고 내부 `GuardianAccount`와 연결합니다.
- 모든 대상자·사건 쿼리는 활성 `CareConnection`을 기준으로 인가합니다.

### 13-2. 보호 대상자 기기

- 6자리 코드는 10분 만료와 시도 제한을 가진 단회성 활성화 수단입니다.
- 활성화 후에는 회전 가능한 기기 전용 자격 증명을 사용합니다.
- 서버에는 원문 자격 증명이 아니라 hash와 기기 식별 메타데이터만 저장합니다.
- 기기 해제·분실 처리 시 자격 증명을 즉시 폐기합니다.

### 13-3. 관리자·데모

- 관리자 기능은 일반 보호자 권한과 분리합니다.
- 공개 데모 route는 합성 fixture만 사용하고 운영 API를 호출하지 않습니다.
- 자유 입력을 허용하지 않고 시나리오 선택만 제공해 공개 URL의 악용 입력면을 제거합니다.

## 14. 개인정보와 데이터 수명

### 14-1. 동의와 공유 계약

Android 권한과 제품 동의를 한 화면에서 묶어 받지 않습니다.

| 구분 | 항목 | 기본값·효과 |
|---|---|---|
| 기기 권한 | 알림 접근, 전화 스크리닝, 알림 표시 | 기능별 별도 요청. 거부한 기능만 대체 입력으로 전환 |
| 필수 제품 동의 | 지정 보호자 연결 | 기기 활성화에 필요하며 연결별로 철회 가능 |
| 선택 동의 | 연결별 HIGH 또는 CRITICAL 자동 보호자 알림 | 기본 꺼짐. 거부해도 연결·로컬 경고·수동 확인 요청 유지 |
| 선택 동의 | 문자 원문 서버 분석 | 기본 꺼짐, 요청 메모리에서만 처리 |
| P1 선택 동의 | 원문을 보호자에게 공유 | 기본 꺼짐, 사건마다 대상자가 승인 |
| 선택 동의 | 비식별 데이터를 모델 개선에 사용 | 기본 꺼짐, 판정·보호 기능과 무관 |

공유 수준은 연결마다 적용합니다.

- `MINIMAL`: 위험 수준, 이벤트 유형, 발생 시각
- `BASIC`: `MINIMAL` + 마스킹 번호, 행동 신호, 사건 단계
- `EXTENDED`: P1. `BASIC` + 사건·연결별로 대상자가 승인한 15분·1회 문자 원문

P0는 대상자당 보호자 1명과 `MINIMAL`·`BASIC`만 구현합니다.

자동 알림도 연결마다 양측 범위를 교차 적용합니다. 대상자는 `NONE | HIGH | CRITICAL`, 보호자는 `REQUEST_ONLY | HIGH | CRITICAL` 중 하나를 고르며, 실제 자동 임계값은 두 설정 중 더 제한적인 수준입니다. `꼼꼼하게` 프리셋은 HIGH 동의를 권장하지만 동의를 대신하지 않습니다.

통화 음성, 전체 연락처, 계정·인증 정보는 어떤 공유 수준에도 포함하지 않습니다. 원문 서버 분석은 요청 메모리에서 처리 후 폐기합니다. P1 보호자 공유 원문은 별도 `RawShareGrant`에 애플리케이션 계층 암호화하며 지정 보호자의 첫 조회 또는 최대 15분까지만 보관합니다. 동의를 철회하면 새 상세 조회와 알림을 즉시 막고 활성 grant를 즉시 삭제합니다. 연결만 종료하면 해당 연결의 상세 접근과 grant를 즉시 차단·삭제하고 일반 이벤트를 30일 이내 삭제합니다. 계정 탈퇴는 primary DB의 개인정보와 사건 데이터를 즉시 삭제하고, 감사 로그 식별자는 가명화합니다. 관리형 백업의 최종 소거 기한은 공급자 선정 시 30일 이하로 확정합니다.

### 14-2. 데이터 보존

| 데이터 | 기본 처리 | 보존 |
|---|---|---|
| 문자 원문 | 기기 처리, 기본 미저장 | P0 분석용은 메모리 폐기. P1 공유용 grant만 암호화 후 첫 조회 또는 최대 15분 |
| URL | 조회에 필요한 원문 사용 | 정규화 도메인·hash 중심 30일 |
| 전화번호 | TLS 요청에서 평판 조회 후 폐기 | 서버 HMAC hash·화면 마스킹, 이벤트 보존기간과 동일 |
| 통화 음성 | 수집하지 않음 | 없음 |
| 연락처 전체 | 서버 전송하지 않음 | 없음 |
| 계좌번호 | 탐지 시 마스킹 | 원문 미저장 |
| 일반 위험 이벤트 | 최소 메타데이터 | 30일 |
| 사용자가 보존한 사건 | 사용자 요청 | 연결 유지 중 보존, 삭제·연결 종료 후 30일 이내 |
| 데모 상태 | 브라우저 합성 데이터 | sessionStorage 종료 또는 최대 24시간 |
| 평가 로그 | 비식별 데이터 | 90일 |
| 감사 로그 | 동의·권한·상태 변경 | 90일 |

로그 수집 전에 공통 redaction 계층을 적용하고, 오류 추적 서비스의 request body 수집을 비활성화합니다.

### 14-3. P1 원문 공유 grant

이 절은 후속 설계이며 P0 migration·OpenAPI·release에 포함하지 않습니다.

Android가 사건·연결별 승인을 받은 뒤 최대 2,000자의 원문을 전송하면 NestJS가 활성 `EXTENDED` 연결을 검증하고 애플리케이션 계층에서 암호화합니다. 보호자 사건 상세에는 grant ID와 만료 시각만 노출합니다. 보호자의 1회 조회는 row lock 안에서 인가·만료를 다시 확인하고 응답과 함께 ciphertext를 제거합니다.

- `Cache-Control: no-store`
- 첫 조회·15분 만료·철회·연결 해제 중 가장 빠른 조건으로 삭제
- 푸시·outbox·로그·오류 추적에 원문 포함 금지
- 동일 사건의 다른 보호자 연결로 grant 재사용 금지
- scheduled worker와 조회 경로 양쪽에서 만료 제거

## 15. 신뢰 경계

```text
[신뢰 낮음]
문자 원문 / URL / 발신번호 / 데모 입력
        │
        ▼  길이·형식 검증, 정규화, 마스킹
[Android 또는 API 입력 경계]
        │
        ▼
[돈워리 애플리케이션]
        │
        ├──► [외부 평판 API: 부분 신뢰]
        ├──► [LLM: 비결정적·명령 불신]
        └──► [FCM: 전달 채널]
        │
        ▼
[PostgreSQL: 최소 데이터·접근 통제]
```

- 문자와 웹 입력은 명령이 아니라 데이터로 취급해 프롬프트 인젝션을 차단합니다.
- LLM 출력은 허용된 schema와 문장 길이를 검증하고 위험 수준을 변경할 수 없습니다.
- URL 리디렉션 추적은 private IP, loopback, metadata endpoint 접근을 차단한 격리된 서버 요청으로 제한합니다.
- 외부 API key는 Android와 웹 bundle에 넣지 않고 NestJS에서만 사용합니다.

## 16. 복원력과 실패 처리

| 실패 상황 | 시스템 처리 | 사용자 경험 | 검증 |
|---|---|---|---|
| 알림 본문 누락 | 자동 분석 중단, 공유·붙여넣기 안내 | “문자 내용을 가져오지 못했습니다” | 제조사·메시지 앱별 기기 테스트 |
| 전화 스크리닝 로컬 조회 지연 | 제한 시간 전에 안전하게 allow | 통화 지연 없이 미확인 경고 | 강제 timeout 계측 |
| 네트워크 없음 | 로컬 판정·Room 저장·재전송 예약 | 임시 결과와 오프라인 표시 | 비행기 모드 테스트 |
| Safe Browsing timeout | KISA·규칙으로 `FINALIZED_PARTIAL` | 확인하지 못한 항목 명시 | timeout·5xx 테스트 |
| LLM timeout·형식 오류 | 템플릿 설명 | 설명 제공은 유지 | adapter contract 테스트 |
| FCM 일시 실패 | outbox backoff 재시도 | 대시보드에는 사건 유지 | emulator와 오류 주입 |
| FCM 토큰 만료 | 토큰 비활성화, 재등록 유도 | 보호자에게 알림 설정 안내 | invalid-token 테스트 |
| PostgreSQL 장애 | API readiness 실패, Android 로컬 보호 | 저장 지연 안내 | staging 장애 훈련 |
| 웹 배포 장애 | 정적 데모 백업 URL 또는 영상 | 심사 흐름 유지 | 제출 전 복구 리허설 |
| 중복 이벤트 | idempotency key로 병합 | 알림 한 번만 표시 | 재전송·double-submit 테스트 |
| 동의 철회와 알림 경쟁 | 전송 직전 동의 재검증 | 철회 후 신규 알림 없음 | race integration 테스트 |

## 17. 환경 전략

| 환경 | 목적 | 데이터 |
|---|---|---|
| Local | 개발·단위·통합 테스트 | Docker PostgreSQL, 합성 데이터 |
| Staging | 실기기·웹·FCM·외부 API 통합 검증 | 테스트 계정과 합성 데이터 |
| Production | 심사 URL·운영 | 최소 운영 데이터 |

원칙:

- 환경별 Firebase project와 secret을 분리합니다.
- production 데이터베이스를 로컬 개발에 복제하지 않습니다.
- staging과 production은 동일한 migration과 container image를 사용합니다.
- 공개 데모는 feature flag만으로 격리하지 않습니다. 빌드 시 포함된 fixture와 repository 의존성이 없는 전용 route/service 경계를 사용합니다.

## 18. CI/CD와 배포

```text
Pull Request
  ├─ Markdown link/lint
  ├─ Web lint + typecheck + unit
  ├─ API lint + typecheck + unit + integration
  ├─ Android lint + unit
  ├─ OpenAPI 변경 검사
  └─ secret scan
          │
          ▼
main merge
  ├─ Web production build
  ├─ API container build
  ├─ DB migration dry-run
  ├─ Staging deploy + smoke/E2E
  └─ 수동 production 승인
          │
          ▼
release tag
  ├─ 서명 APK build
  ├─ checksum 생성
  └─ APK·데모 영상·문서 보관
```

production migration은 `migrate deploy` 계열의 비대화형 명령으로 실행하고, 적용된 migration 파일을 수정하지 않습니다. 배포 전 자동 백업 또는 복구 지점을 확인합니다.

## 19. 관찰성과 운영

### 19-1. 측정 항목

- Android 알림 파싱 성공·실패율과 실패 사유
- CallScreening 로컬 응답 시간
- API P50/P95 응답 시간과 오류율
- 외부 API별 latency·timeout·fallback 비율
- 위험 수준 분포와 UNKNOWN 비율
- outbox 대기·재시도·최종 실패 건수
- FCM 전송 성공률
- 데모 시나리오 성공률
- 공개 웹과 API health 상태

### 19-2. 로그 정책

- JSON 구조화 로그
- 요청별 correlation ID
- `RiskEvent`, `Incident`, `Outbox` 식별자만 기록
- 문자 원문, 전체 URL query, 전화번호, 계좌정보, token 기록 금지
- production 로그 수준 변경은 환경 변수로 제어

### 19-3. 운영 목표

| 지표 | MVP 목표 |
|---|---|
| 로컬 첫 경고 | OS callback 수신부터 경고 알림 게시까지 P95 1초 이하 |
| 전화 스크리닝 내부 처리 | callback부터 `respondToCall` 호출까지 P95 500ms, hard timeout 2초 |
| 핵심 API | 외부 API 제외 P95 500ms 이하 |
| Safe Browsing | 요청당 timeout 1,200ms, 실패 시 즉시 partial 결과 |
| 서버 최종 분석 | 템플릿 설명 포함 P95 3초 이하 |
| LLM 설명 보강 | 비동기 최대 5초, 경고·알림을 차단하지 않음 |
| CRITICAL outbox | 최종 판정 transaction에 포함, worker 시작 P95 2초 이하 |
| 보호자 알림 전송 성공률 | 95% 이상 |
| 열린 대시보드 갱신 | 화면 활성 중 5초 polling, 백그라운드 polling 없음 |
| 웹 데모 완주율 | 제출 전 검증 세트에서 100% |
| production health 확인 | 운영 기간 자동 주기 점검 |

FCM은 외부 전달 채널이므로 기기 표시 시각까지의 상한은 보장하지 않습니다. 대신 outbox 생성, worker 시작, FCM 수락과 브라우저 표시를 각각 측정합니다.

## 20. 용량 가정

MVP는 대회 검증과 제한된 사용자 테스트를 대상으로 합니다.

- 생활지원사 1명당 대상자 20~25명
- 대상자당 하루 위험 후보 이벤트 수십 건 이하
- 동시 심사위원 세션 수십 개 이하
- API 단일 인스턴스와 관리형 PostgreSQL로 충분

이 가정을 넘는 실제 기관 도입 단계에서만 별도 worker, Redis/BullMQ, 수평 확장과 조직 tenant를 검토합니다.

### 20-1. P0 완주선과 대체 기준

반드시 제출물에 포함할 수직 흐름은 다음 네 가지입니다.

1. 로그인 없는 웹 데모에서 문자 → 전화 → 행동 설문 → 대응 체크리스트를 완주
2. Android 공유·붙여넣기 문자 분석과 로컬 경고
3. 대상자 활성화 → CRITICAL 사건 → 보호자 대시보드·웹 푸시
4. 보호자 대시보드에서 25명 우선순위 정렬 → 전화 → 사건 해결

공유·붙여넣기 문자 분석과 수동 번호 확인은 **core P0**입니다. Notification Listener와 Call Screening 자동 감지는 **gated P0**이며, Phase 0의 8시간 실기기 검증을 통과한 기능만 제출 범위에 포함합니다. 실패한 자동 기능은 P1 또는 실험 기능으로 표시하고 core P0 완료를 막지 않습니다.

Phase 0 실기기 스파이크 결과에 따른 대체 기준:

| 실패·제약 | P0 대체 경로 | 제출 시 처리 |
|---|---|---|
| Notification Listener가 주요 메시지 앱에서 본문을 안정적으로 주지 않음 | 공유 메뉴·붙여넣기를 기본 입력으로 전환 | 자동 감지는 실험 기능으로 명시 |
| Call Screening 역할 또는 callback이 목표 기기에서 불안정 | 수동 번호 검사 + 웹 데모의 합성 전화 이벤트 | 실전화 자동 연관을 P1로 내리고 제한 공개 |
| 경고 Activity 전면 표시가 불안정 | 고우선순위 알림 → 탭해서 경고 화면 진입 | 전면 표시를 완료 조건에서 제외 |
| LLM 품질·timeout이 기준 미달 | 검증된 설명 템플릿 | LLM adapter 비활성화 |
| Safe Browsing 연동 실패 | KISA snapshot·도메인 규칙·합성 평판 fixture | 외부 미확인 상태를 명시 |
| Web Push가 지원 브라우저에서 실패 | 대시보드 사건·전송 실패 표시 | 핵심 알림 경로이므로 release 전 해결하거나 제한사항 공개 |

30분 집중 보호 모드, 음성 읽기, PDF 내보내기, 관리자 moderation, 실시간 타임라인, 자체 학습 모델은 P1 이후로 내립니다.

## 21. 구현 단계

### Phase 0 — 기술 스파이크

- Samsung 실기기에서 Notification Listener 본문 추출
- 지원 Android 버전과 기본 전화 앱 조합에서 Call Screening 역할 요청·callback·P95 응답 시간
- 통화 종료 후 설문 진입 방법
- 고우선순위 알림·경고 Activity와 대체 경로
- Android → NestJS → 웹·FCM 왕복

스파이크 종료 시 지원 Android 버전, 검증 기기 모델, 기본 메시지·전화 앱과 각 자동 기능의 지원 여부를 표로 고정합니다. 위 대체 기준을 충족하지 못하는 기능은 P0에서 즉시 내립니다.

### Phase 1 — 제출 기반

- 모노레포와 CI
- 보호자 인증
- 대상자 프로필·기기 활성화·동의
- 공개 웹과 API 배포
- PostgreSQL migration과 health check

### Phase 2 — 문자·URL 수직 슬라이스

- 알림·공유·붙여넣기
- 로컬 규칙과 서버 최종 분석
- KISA·Safe Browsing
- 근거 설명과 fallback

### Phase 3 — 전화·보호자 수직 슬라이스

- 로컬 전화 스크리닝
- 문자–전화 시간 연관
- CRITICAL outbox·FCM
- 1:25 우선순위 대시보드

### Phase 4 — 사건 대응·데모

- 통화 후 행동 설문
- S0~S4와 체크리스트
- 합성 데모 세션
- 평가·운영·장애 복구

## 22. 테스트 아키텍처

```text
CODE PATH COVERAGE
==================
Android
├─ LocalSafetyPolicy ............. unit
├─ Notification parser ........... unit + device fixture
├─ Room/retry .................... integration
├─ CallScreening deadline ........ instrumented + real device
└─ warning/survey flow ........... Compose UI + real device

NestJS
├─ DTO/auth/authorization ........ unit + integration
├─ RiskEngine/correlation ........ unit + golden dataset
├─ reputation adapters ........... contract + timeout injection
├─ incident state machine ........ unit + integration
├─ raw share grant (P1) .......... authorization + expiry/race
├─ outbox/FCM retry ............... integration
└─ demo isolation ................ integration

Next.js
├─ dashboard sorting .............. unit/component
├─ incident actions ............... component + API integration
├─ auth/session recovery .......... E2E
└─ demo scenario .................. E2E

USER FLOW COVERAGE
==================
[E2E] 대상자 생성 → 6자리 활성화 → 동의
[E2E] 문자 입력 → 위험 분석 → CRITICAL 알림 → 보호자 확인
[E2E] 의심 문자 → 연관 전화 → 설문 → 사건 대응
[E2E] 대상자 25명 → 우선순위 정렬 → 전화 → RESOLVED
[E2E] 공개 데모 → 6개 시나리오 완주
[E2E] 외부 API 장애 → fallback 설명과 데모 유지
[EVAL] LLM 설명 → 근거 충실성·금지 표현·행동 지침
```

현재 저장소에는 구현 코드와 테스트 프레임워크가 없습니다. 위 경로는 scaffolding과 동시에 테스트를 추가하는 기준입니다.

구현 시 복잡한 흐름은 다음 파일에 짧은 ASCII 주석을 함께 둡니다.

- `packages/risk-engine/src/evaluate.ts`: 입력 신호 → 강제 규칙 → 점수 → 위험 수준
- `apps/api/src/incidents/incident-state-machine.ts`: 사건 상태 전이와 금지 전이
- `apps/api/src/notifications/outbox-worker.ts`: 선점 → 재검증 → 전송 → 재시도
- `apps/android/.../callscreening/CallScreeningCoordinator.kt`: deadline 안의 로컬 조회와 fallback

## 23. NOT in scope

| 항목 | 제외 이유 |
|---|---|
| Redis·BullMQ | MVP 처리량보다 운영 복잡도가 큼. PostgreSQL outbox로 충분 |
| Python/FastAPI 운영 서비스 | 자체 모델 추론이 없고 런타임·배포가 하나 더 생김 |
| React Native·Flutter·Capacitor | 핵심 Android 시스템 서비스는 결국 네이티브 bridge가 필요 |
| WebSocket 인프라 | P0는 FCM과 화면 활성 중 5초 polling으로 충분. 실시간 타임라인은 P1 |
| Kubernetes | 단일 API와 웹 배포에 과도함 |
| 기본 SMS·전화 앱 | Play 정책·범위가 크고 APK 심사에는 불필요 |
| 오버레이 강제 권한 의존 | 제조사·OS 편차가 커 P0 성공 조건으로 사용할 수 없음 |
| 조직 tenant·근무표·교대 | 기관 도입 단계의 운영 문제. MVP는 직접 CareConnection |
| 자동 학습 | 오염과 개인정보 위험. 검수된 데이터만 다음 버전에 반영 |
| 통화 음성·STT | 기술·개인정보·정책 위험이 MVP 가치보다 큼 |

## 24. 미해결 결정과 검증 시점

| 결정 | 현재 기본값 | 확정 시점 |
|---|---|---|
| 배포 공급자 | 관리형 Web/API/PostgreSQL | Phase 0에서 비용·콜드스타트·리전 확인 |
| 생활지원사 야간·휴무 CRITICAL | 대상자 공식기관 경로 + 등록된 보조 보호자, 알림은 보관 | 3주차 사용자 테스트 |
| 경고 Activity 동작 범위 | 고우선순위 알림 fallback 필수 | Samsung 실기기 스파이크 |
| KISA 데이터 형식·갱신 | 마지막 성공 snapshot | 2주차 데이터 연동 |
| Safe Browsing 사용 조건 | 대회 비상업적 데모 | 제출 전 라이선스 재확인 |
| LLM 공급자 | adapter 뒤에 숨김 | 비용·한국어 품질 eval 후 |

## 25. 공식 기술 근거

- [Android NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
- [Android CallScreeningService](https://developer.android.com/reference/android/telecom/CallScreeningService)
- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
- [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [Google Safe Browsing API](https://developers.google.com/safe-browsing/reference/rest)

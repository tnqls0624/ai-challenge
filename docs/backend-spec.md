# 돈워리 MVP 백엔드 사양

> 상태: 구현 기준 초안
>
> 관련 문서: [인프라 아키텍처](infrastructure-architecture.md) · [위험 판정](risk-spec.md) · [개인정보·보안](privacy-security.md)

## 1. 범위

NestJS 모듈형 모놀리스의 인증 주체, REST 계약, 인가, transaction과 데이터 불변조건을 정의합니다. 실제 DTO의 최종 기준은 NestJS에서 생성한 OpenAPI이며 이 문서는 도메인 의미를 정의합니다.

## 2. 실행 단위

```text
Production single process
┌──────────────────────────────────┐
│ NestJS API                       │
│ ├─ HTTP controllers              │
│ ├─ application services          │
│ ├─ Prisma repositories           │
│ └─ scheduled outbox worker       │
└────────────────┬─────────────────┘
                 ▼
          Managed PostgreSQL
```

- MVP production은 API 한 인스턴스에서 `WORKER_ENABLED=true`로 worker를 실행합니다.
- 다중 인스턴스로 전환할 때 worker를 분리하고 `FOR UPDATE SKIP LOCKED` 선점을 적용합니다.
- 공개 데모는 이 API를 사용하지 않습니다.

## 3. 인증 주체

| 주체 | 인증 | 서버 저장 |
|---|---|---|
| 보호자 | Firebase ID token | Firebase UID와 내부 계정 연결 |
| 대상자 Android | 6자리 활성화 후 device credential | credential hash, 상태, 회전 시각 |
| 공개 데모 | 인증 없음 | 운영 API 접근 없음 |
| 관리자 | Firebase custom claim 또는 별도 allowlist | 보호자 권한과 분리 |

NestJS는 Firebase ID token을 검증하지만 비밀번호와 refresh token을 저장하지 않습니다.

## 4. 대상자 활성화

```text
Guardian creates SubjectProfile
  → API issues 6-digit code
  → Android submits code to activation preview
  → API returns one-time activationSession + pending connection summary
  → Android shows permissions, share level, auto-alert consent
  → Subject approves
  → one DB transaction:
       Device ACTIVE
       CareConnection ACTIVE
       Consent records
       activation code CONSUMED
  → issue device credential
```

불변조건:

- 코드는 10분 만료, 1회 사용입니다.
- 기기·IP별 15분에 5회까지만 검증합니다.
- P0에서 한 대상자는 활성 보호자 연결을 1개만 가집니다. P1 다중 보호자 기능에서 최대 3개로 확장합니다.
- 동의가 완료되기 전에는 기기와 연결을 ACTIVE로 만들지 않습니다.
- preview는 코드를 소비하지 않으며 원래 코드의 만료 시각을 넘지 않는 `activationSessionId`만 반환합니다.
- activate 성공 transaction에서 코드를 소비합니다. `Idempotency-Key` 재시도는 같은 활성화 결과를 반환합니다.
- `CARE_CONNECTION`을 거절하면 session과 코드를 폐기하고 활성화하지 않습니다. 선택적 자동 알림을 거절해도 연결과 기기는 활성화합니다.
- 실패·만료·재사용은 안정적인 오류 코드로 응답합니다.

## 5. REST 규약

- prefix: `/v1`
- JSON과 UTC ISO 8601 사용
- collection은 cursor pagination 사용
- Android 이벤트 생성은 `Idempotency-Key` 필수
- 일반 resource 응답은 전체 전화번호·원문·secret을 포함하지 않음
- P1 원문은 별도 1회성 `RawShareGrant` 응답에서만 반환하고 `Cache-Control: no-store` 적용
- mutation 성공은 최신 resource version을 반환

공통 오류:

```json
{
  "code": "ACTIVATION_CODE_EXPIRED",
  "message": "활성화 코드가 만료되었습니다.",
  "correlationId": "req_...",
  "details": {}
}
```

| HTTP | 사용 |
|---:|---|
| 400 | schema·정규화 오류 |
| 401 | 인증 없음·만료 |
| 403 | 연결·공유 수준·역할 불충족 |
| 404 | resource 없음 또는 존재를 숨겨야 하는 미인가 |
| 409 | idempotency 충돌·잘못된 상태 전이 |
| 422 | 형식은 맞지만 정책상 처리 불가 |
| 429 | 활성화·공개 endpoint rate limit |
| 503 | 필수 의존성 장애 |

## 6. Endpoint matrix

### 보호자·대상자·연결

| Method | Path | 주체 | 목적 |
|---|---|---|---|
| POST | `/v1/auth/guardian/session` | 보호자 | 검증된 Firebase 계정과 내부 계정 연결 |
| DELETE | `/v1/guardians/me` | 보호자 | 계정 탈퇴와 삭제 작업 시작 |
| POST | `/v1/subjects` | 보호자 | 대상자 프로필 생성 |
| GET | `/v1/subjects` | 보호자 | 활성 연결 대상자 목록 |
| GET | `/v1/subjects/:id` | 보호자 | 공유 수준에 맞는 대상자 요약 |
| POST | `/v1/subjects/:id/activation-codes` | 보호자 | 6자리 코드 발급 |
| POST | `/v1/devices/activation-previews` | Android | 코드를 확인하고 만료가 같은 activation session 발급 |
| POST | `/v1/devices/activate` | Android | session·필수 연결 동의로 코드 소비·기기 활성화 |
| DELETE | `/v1/devices/activation-sessions/:id` | Android | 연결 거절·session과 코드 폐기 |
| DELETE | `/v1/devices/:id` | 보호자/기기 | 분실·해제 credential 폐기 |
| DELETE | `/v1/subjects/me` | Android | 대상자 자신의 primary data·연결·credential 삭제 |
| GET | `/v1/care-connections` | 보호자 | 연결 목록 |
| PATCH | `/v1/care-connections/:id/subject-settings` | Android | 공유 수준·자동 알림 승인 범위 변경 |
| PATCH | `/v1/care-connections/:id/guardian-settings` | 보호자 | 수신 임계값·웹 푸시 설정 변경 |
| DELETE | `/v1/care-connections/:id` | 연결 당사자 | 연결 해제 |
| GET | `/v1/devices/me/consents` | Android | 현재 동의·문구 버전 조회 |
| PUT | `/v1/devices/me/consents/:type` | Android | 독립 동의 승인·철회 |

### 위험 이벤트·정책

| Method | Path | 주체 | 목적 |
|---|---|---|---|
| POST | `/v1/risk-events` | Android | SMS·CALL·URL·MANUAL 이벤트 생성 |
| GET | `/v1/risk-events/:id` | 연결 당사자 | 공유 수준에 맞는 결과 조회 |
| GET | `/v1/risk-events` | 보호자 | 대상자·수준·상태별 목록 |
| POST | `/v1/risk-events/:id/post-call-survey` | Android | 행동 신호 추가·재판정 |
| POST | `/v1/risk-events/:id/help-requests` | Android | 보호자 확인 요청 |
| GET | `/v1/risk-policies/current` | Android | 서명된 로컬 정책 조회 |

### 사건·대응

| Method | Path | 주체 | 목적 |
|---|---|---|---|
| POST | `/v1/incidents` | Android/API | 관련 이벤트를 사건으로 승격 |
| GET | `/v1/incidents` | 보호자 | 우선순위 사건 목록 |
| GET | `/v1/incidents/:id` | 연결 당사자 | 사건·근거·대응 항목 |
| PATCH | `/v1/incidents/:id/stage` | 연결 당사자 | S0~S4 단계 변경 |
| PATCH | `/v1/incidents/:id/status` | 보호자 | ACKNOWLEDGED~RESOLVED 전이 |
| GET | `/v1/incidents/:id/action-items` | 연결 당사자 | 체크리스트 |
| PATCH | `/v1/action-items/:id` | 연결 당사자 | 완료·담당 기록 |

### 웹 푸시·운영

| Method | Path | 주체 | 목적 |
|---|---|---|---|
| POST | `/v1/guardian-push-subscriptions` | 보호자 | 브라우저 push token 등록 |
| DELETE | `/v1/guardian-push-subscriptions/:id` | 보호자 | 구독 폐기 |
| GET | `/health/live` | 공개 | process liveness |
| GET | `/health/ready` | 배포 시스템 | DB·필수 설정 readiness |

### P1 예약 endpoint

아래 endpoint는 설계만 고정하며 P0 OpenAPI·migration·release 범위에는 넣지 않습니다.

| Method | Path | 주체 | 목적 |
|---|---|---|---|
| POST | `/v1/devices/me/guardian-invitation-codes` | Android | 두 번째·세 번째 보호자용 10분 코드 발급 |
| POST | `/v1/care-connection-claims` | 보호자 | 대상자 코드 claim, PENDING_CONSENT 연결 생성 |
| GET | `/v1/devices/me/pending-care-connections` | Android | claim한 보호자 요약 목록 |
| POST | `/v1/care-connections/:id/approve` | Android | 추가 보호자 연결 승인 |
| POST | `/v1/risk-events/:id/raw-share-grants` | Android | 사건별 15분·1회 원문 공유 |
| GET | `/v1/raw-share-grants/:id` | 보호자 | 승인된 원문을 원자적으로 1회 조회 |
| DELETE | `/v1/raw-share-grants/:id` | Android | 조회 전 공유 승인 철회 |

### P0 핵심 mutation DTO

```ts
type SubjectConnectionSettingsPatch = {
  version: number;
  shareLevel?: 'MINIMAL' | 'BASIC';
  autoGuardianAlert?: {
    threshold: 'NONE' | 'HIGH' | 'CRITICAL';
    consentTextVersion: string;
  };
};

type GuardianConnectionSettingsPatch = {
  version: number;
  receiveThreshold?: 'REQUEST_ONLY' | 'HIGH' | 'CRITICAL';
  pushEnabled?: boolean;
};

type ConsentPut = {
  granted: boolean;
  consentTextVersion: string;
  connectionId?: string;
};
```

- Android token만 `subject-settings`와 `ConsentPut`을 변경할 수 있습니다.
- Firebase 보호자 token만 `guardian-settings`를 변경할 수 있습니다.
- unknown field는 400, stale `version`은 409를 반환합니다.
- `shareLevel=EXTENDED`와 추가 보호자 mutation은 P0에서 422 `FEATURE_NOT_AVAILABLE`입니다.
- 동의 철회 요청은 멱등이며 이미 철회된 경우 현재 resource를 반환합니다.
- `subject-settings.autoGuardianAlert`는 threshold와 버전형 동의 증거를 같은 transaction에서 변경합니다. `NONE`은 철회, `HIGH | CRITICAL`은 승인·범위 변경입니다.
- P0 `ConsentPut`은 독립 동의인 `RAW_SERVER_ANALYSIS`, `MODEL_IMPROVEMENT`에만 사용합니다. 연결 자체의 철회는 `DELETE /care-connections/:id`로 처리합니다.

활성화 요청:

```ts
type ActivationPreviewRequest = {
  code: string;
  deviceInstallationId: string;
};

type ActivationFinalizeRequest = {
  activationSessionId: string;
  devicePublicKey: string;
  shareLevel: 'MINIMAL' | 'BASIC';
  careConnectionConsent: {
    granted: true;
    consentTextVersion: string;
  };
  autoGuardianAlertConsent: {
    granted: boolean;
    threshold: 'NONE' | 'HIGH' | 'CRITICAL';
    consentTextVersion: string;
  };
};
```

preview 응답은 대상자 프로필의 최소 표시명, 보호자 표시명·역할, session 만료 시각과 동의 문구 버전만 포함합니다. finalize는 `Idempotency-Key`가 필수입니다.
`autoGuardianAlertConsent.granted=false`이면 threshold는 `NONE`, true이면 `HIGH` 또는 `CRITICAL`만 허용합니다.

## 7. 인가

| Resource | 대상자 기기 | 연결 보호자 | 비연결 보호자 | 관리자 |
|---|:---:|:---:|:---:|:---:|
| 자신의 RiskEvent 생성 | O | - | - | - |
| RiskEvent 요약 조회 | O | 공유 수준 내 O | X | 감사 목적 |
| P1 원문 공유 생성·철회 | 자신의 이벤트에 사건별 승인 시 | X | X | X |
| P1 원문 1회 조회 | X | EXTENDED+지정 연결+유효 grant | X | 기본 X |
| Incident 상태 변경 | 제한적 | O | X | 감사 목적 |
| CareConnection 대상자 설정 | 공유·자동알림 승인 범위 O | X | X | X |
| CareConnection 보호자 설정 | X | 자신의 수신 임계값 O | X | X |
| Consent 승인·철회 | 자신의 동의 O | X | X | 감사 목적 |
| 운영 실패 조회 | X | X | X | O |

모든 쿼리는 resource 조회 후가 아니라 활성 `CareConnection` 조건을 포함해 실행합니다.

## 8. 핵심 상태

```text
Device:
PENDING → ACTIVE → REVOKED

CareConnection:
PENDING_CONSENT → ACTIVE → REVOKED

RiskEvent:
RECEIVED → LOCAL_ANALYZED → REPUTATION_CHECKING
  → FINALIZED | FINALIZED_PARTIAL

NotificationOutbox:
PENDING → PROCESSING → SENT
             ├──────→ PENDING (retry)
             ├──────→ FAILED
             └──────→ CANCELLED

Incident:
OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED
   └──────────────────────→ ESCALATED
```

잘못된 전이는 409와 `INVALID_STATE_TRANSITION`을 반환하고 상태 이력을 남깁니다.

## 9. 핵심 데이터 불변조건

- `risk_events(device_id, event_id)` unique
- `notification_outbox(dedupe_key)` unique
- P0 활성 보호자 연결은 대상자당 1개
- `RiskEvent.policyVersion` 필수
- `Incident.stage`와 처리 `status`는 별도
- 동의는 문구 버전, 동의·철회 시각, actor와 device를 기록
- raw text는 RiskEvent·Incident·로그·outbox 일반 컬럼에 저장하지 않음
- P1 보호자 공유용 `RawShareGrant`만 애플리케이션 계층 암호화, 15분 TTL, 1회 조회
- 전화번호 원문은 평판 조회 요청에서만 처리하고 서버 HMAC hash와 화면용 masked 값만 저장
- 자동 알림은 대상자 승인 임계값과 보호자 수신 임계값 중 더 제한적인 값을 적용

## 10. Transaction 경계

| 작업 | 같은 transaction에 포함 |
|---|---|
| 기기 활성화 | 코드 소비, Device, CareConnection, Consent |
| 위험도 확정 | RiskEvent, RiskSignal, 필요 시 Incident, NotificationOutbox |
| 연결 철회 | CareConnection revoke, credential/알림 정책 갱신, AuditLog |
| 자동 알림 승인·범위 변경·철회 | Consent version, subject threshold, 필요 시 미전송 Outbox CANCELLED, AuditLog |
| 사건 상태 변경 | Incident version, history, ActionItem 변경 |
| P1 원문 공유 1회 조회 | grant row lock, 인가·만료 확인, consumed 처리와 ciphertext 삭제 |

외부 FCM·LLM·Safe Browsing 호출은 DB transaction 안에서 실행하지 않습니다.

## 11. P1 원문 공유 전달

이 절은 후속 설계이며 P0 migration·OpenAPI·release에 포함하지 않습니다.

`RAW_SERVER_ANALYSIS`와 `RAW_GUARDIAN_SHARE`는 별도 흐름입니다.

```text
Android 사건별 승인
  → active EXTENDED connection 검증
  → 최대 2,000자 원문을 애플리케이션 계층 암호화
  → RawShareGrant(expiresAt = now + 15분)
  → 보호자 사건 상세에는 grant metadata만 노출
  → 보호자 GET에서 row lock·인가 재검증
  → plaintext 1회 반환 + ciphertext 삭제
```

- grant는 한 `CareConnection`만 대상으로 하며 다른 보호자에게 전파하지 않습니다.
- `Cache-Control: no-store`를 적용하고 원문을 로그·오류 추적·감사 상세·푸시에 넣지 않습니다.
- 첫 조회, 15분 만료, Android 철회, 연결 철회, 계정 삭제 중 가장 이른 시점에 ciphertext를 삭제합니다.
- 만료 정리는 scheduled worker가 수행하며 조회 시에도 만료를 재검증합니다.
- 중복 POST는 `Idempotency-Key`로 같은 활성 grant를 반환하고 TTL을 연장하지 않습니다.

## 12. Outbox 전달

전달 보장은 at-least-once입니다.

```text
claim PENDING (max 20, due order)
  → PROCESSING + lockedAt/lockOwner + attempt increment
  → consent/connection recheck
  → FCM send(notificationId)
  → SENT
      or retry as PENDING with backoff
      or FAILED
```

- scheduler poll: 1초
- claim: 짧은 DB transaction에서 `FOR UPDATE SKIP LOCKED`, 한 번에 최대 20건
- lease: 30초. 만료된 `PROCESSING`은 recovery sweep이 `PENDING`으로 되돌림
- 최대 시도: 6회. 시작 시각 기준 `0초, 5초, 30초, 2분, 10분, 30분`
- 일시 오류·timeout만 재시도하고 invalid token·잘못된 payload는 즉시 영구 실패
- 동일 사건·보호자·위험 버전으로 `dedupe_key` 생성
- payload에 안정적인 `notificationId` 포함
- FCM 성공 후 DB 반영 전 process 종료 시 재전송 가능
- service worker와 웹 알림함이 `notificationId`로 표시 중복 제거
- 영구 실패는 push token 비활성화 후보로 표시
- 운영 재처리는 감사 로그를 남기는 `outbox:replay --id` script로만 수행하고 전송 직전 동의·연결을 다시 검사

## 13. 삭제 계약

- 연결 해제: 새 조회·알림 즉시 차단, 활성 raw grant 즉시 삭제, 나머지 연결 데이터 30일 이내 삭제
- 보호자 탈퇴: primary DB 개인정보·사건 접근 정보 즉시 삭제
- 대상자 삭제: 활성 device credential 즉시 폐기하고 primary data 삭제
- 감사 로그: 식별자를 가명화하고 90일 후 삭제
- 관리형 backup: 공급자 선정 후 최대 30일 이내 소거 조건 확정

삭제 작업은 `deletion_request_id`, 시작·완료 시각과 실패 사유를 남기되 삭제 대상 원문은 로그에 남기지 않습니다.

## 14. OpenAPI 완료 조건

- 모든 DTO가 concrete class와 runtime validation을 가짐
- unknown field 거부
- 보안 scheme과 actor별 endpoint 표시
- error code example 포함
- Android·웹 client 생성 후 compile
- OpenAPI breaking diff를 CI에서 검사
- generated client는 직접 수정하지 않음

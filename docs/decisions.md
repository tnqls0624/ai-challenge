# 돈워리 기술·제품 결정 기록

> 상태: 운영 중
>
> 관련 문서: [인프라 아키텍처](infrastructure-architecture.md) · [개발 스택](development-stack.md)

## 기록 규칙

- 사용자 가치·비용·복원력에 영향을 주는 결정만 기록합니다.
- 상태는 `ACCEPTED`, `SUPERSEDED`, `PENDING`입니다.
- 결정이 바뀌면 기존 행을 삭제하지 않고 새 결정에서 이전 ID를 참조합니다.

## 확정 결정

| ID | 날짜 | 결정 | 상태 | 핵심 근거 |
|---|---|---|:---:|---|
| `D-001` | 2026-07-27 | Android는 Kotlin 네이티브 | ACCEPTED | NotificationListener·CallScreening·백그라운드 생명주기 직접 제어 |
| `D-002` | 2026-07-27 | 제품 백엔드는 NestJS 모듈형 모놀리스 | ACCEPTED | 1인 개발, 웹과 TypeScript 공유, 별도 모델 서버 불필요 |
| `D-003` | 2026-07-27 | 보호자·심사 화면은 Next.js 웹앱 | ACCEPTED | 보호자 설치 부담 제거, 공개 URL 제출 조건 |
| `D-004` | 2026-07-27 | 대상자는 로그인 계정 없이 기기 활성화 | ACCEPTED | 고령자 온보딩 축소, 보호자가 프로필 생성 |
| `D-005` | 2026-07-27 | Redis/BullMQ 대신 PostgreSQL outbox | ACCEPTED | 처리량보다 운영 단순성, 사건과 알림 enqueue transaction |
| `D-006` | 2026-07-27 | NestJS Express adapter 사용 | ACCEPTED | 호환성·디버깅 우선, 병목 시 adapter 교체 가능 |
| `D-007` | 2026-07-27 | FCM은 보호자 Web Push에 사용 | ACCEPTED | 대상자 즉시 경고는 로컬이어야 함 |
| `D-008` | 2026-07-27 | 공개 데모는 운영 API·DB·FCM과 격리 | ACCEPTED | 공개 URL의 개인정보·오발송 위험 제거 |
| `D-009` | 2026-07-27 | 위험 수준은 결정적 RiskEngine이 결정 | ACCEPTED | 재현성·설명 가능성, LLM 오판 차단 |
| `D-010` | 2026-07-27 | 별도 경량 분류 API는 P0 제외 | ACCEPTED | 평가 개선이 입증되지 않은 운영 서비스 제거 |
| `D-011` | 2026-07-27 | full-screen 경고를 P0 완료 조건에서 제외 | ACCEPTED | Android 버전·목적 제한, 고우선순위 알림 fallback |
| `D-012` | 2026-07-27 | 30분 보호 UI·음성·PDF·WebSocket은 P1 | ACCEPTED | 6주 수직 흐름 완주 우선 |
| `D-013` | 2026-07-27 | P1 보호자 원문 공유는 사건·연결별 15분·1회 grant | ACCEPTED | 기본 미저장 원칙과 비동기 웹 조회를 함께 만족 |
| `D-014` | 2026-07-27 | P0는 대상자당 보호자 1명·MINIMAL/BASIC 공유 | ACCEPTED | 1인 개발 6주 완주, 1:25 보호자 가치 검증에 충분 |
| `D-015` | 2026-07-27 | Notification Listener·Call Screening은 Phase 0 gate형 P0 | ACCEPTED | 8시간 실기기 검증 실패 시 수동 경로로 즉시 축소 |
| `D-016` | 2026-07-28 | 자동 문자·전화 감지는 조건부 P0를 유지하되 Samsung 실기기 검증 전에는 `VERIFIED`로 승격하지 않음 | ACCEPTED | API 29·36 에뮬레이터 gate 통과, Samsung Messages·Phone 조합은 미검증 |
| `D-017` | 2026-07-28 | LLM 설명은 기본 비활성 template과 선택형 OpenAI adapter로 운영 | ACCEPTED | 판정 후 최소 신호만 전송, 1.5초 timeout·strict schema·근거 검사·무조건 fallback |
| `D-018` | 2026-07-28 | MVP Web/API/PostgreSQL은 Render Singapore의 유료 최소 plan으로 통합 운영 | ACCEPTED | 1인 운영 단순성, Blueprint 재현성, 무수면 Web/API, paid DB PITR·backup |

## 결정 추적

| ID | 결정 | 현재 기본값 | 상태 | 필요한 근거 |
|---|---|---|:---:|---|
| `P-001` | Web/API/PostgreSQL 공급자 | `D-018` Render Singapore | RESOLVED | container·Blueprint·migration 로컬 검증 완료, 계정 비용 승인 대기 |
| `P-002` | LLM 공급자·모델 | OpenAI adapter 구현 + template 기본값 | PENDING | 한국어 품질, latency, 비용, 약관 |
| `P-003` | Safe Browsing 사용 가능 범위 | 대회 비상업 후보 | PENDING | 공식 약관과 대회 운영 성격 |
| `P-004` | KISA snapshot 형식·갱신 | 마지막 정상 버전 | PENDING | schema, 이용 조건, 갱신주기 |
| `P-005` | Android 자동 감지 지원 조합 | Samsung 주 기기 | PENDING | `android-spike.md` 실측 |
| `P-006` | 야간·휴무 CRITICAL 수신 | 보조 보호자+공식 경로 | PENDING | 생활지원사 운영 현실 |
| `P-007` | backup 최종 소거 기한 | Render PITR 3일·논리 backup 7일, 최대 30일 목표 | PENDING | 계정·삭제 drill로 실제 소거 확인 |

## 결정 제안 형식

```text
ID:
Date:
Context:
Decision:
Alternatives:
Consequences:
Validation:
Affected docs/code:
Status:
```

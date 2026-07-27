# 돈워리 배포·운영 런북

> 상태: 공급자 선정 전 골격
>
> 운영 필수 기간: 2026-09-07 11:00 KST ~ 2026-09-11 23:59 KST
>
> 관련 문서: [인프라 아키텍처](infrastructure-architecture.md) · [릴리스 체크리스트](release-checklist.md)

## 1. 환경

| 환경 | 목적 | 데이터 | 외부 연동 |
|---|---|---|---|
| Local | 개발·통합 | 합성 seed | mock 기본 |
| Staging | Android·FCM·외부 API 통합 | 테스트 계정·합성 데이터 | 별도 project/key |
| Production | 제출 URL·운영 | 최소 운영 데이터 | production project/key |

production DB를 local에 복제하지 않습니다.

## 2. 공급자 기록

| 항목 | 값 |
|---|---|
| Web provider/project | `TO_BE_FILLED` |
| API provider/service | `TO_BE_FILLED` |
| PostgreSQL provider/instance | `TO_BE_FILLED` |
| Region | `TO_BE_FILLED` |
| Production URL | `TO_BE_FILLED` |
| API URL | `TO_BE_FILLED` |
| Status page/console | `TO_BE_FILLED` |
| Backup policy | `TO_BE_FILLED` |

## 3. 필수 설정

이름만 `.env.example`에 기록하고 값은 runtime secret에 둡니다.

```text
DATABASE_URL
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
SAFE_BROWSING_API_KEY
LLM_PROVIDER
LLM_API_KEY
SENTRY_DSN
WORKER_ENABLED
APP_VERSION
RISK_POLICY_VERSION
```

`LLM_API_KEY`는 template-only 모드에서는 필수가 아닙니다.

## 4. 배포 순서

```text
release commit
  → CI unit/integration/build
  → DB backup/restore point 확인
  → migration dry-run
  → staging deploy
  → smoke + 핵심 E2E
  → production migration
  → API deploy
  → Web deploy
  → health + canary
  → release artifact 기록
```

명령의 최종 형태는 provider 선정 후 채웁니다.

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm db:migrate:deploy
pnpm test:smoke
```

## 5. Migration

- production에 적용된 migration은 수정·삭제하지 않습니다.
- destructive SQL은 release에 포함하지 않습니다.
- nullable 추가 → backfill → constraint 순으로 전환합니다.
- 배포 전 backup 또는 복구 지점을 확인합니다.
- migration 실패 시 새 API를 올리지 않습니다.
- migration과 이전 API가 호환되지 않으면 maintenance window와 rollback 계획을 별도 승인합니다.

## 6. Health

| Endpoint | 성공 조건 | 실패 의미 |
|---|---|---|
| `/health/live` | process event loop 응답 | process restart 후보 |
| `/health/ready` | DB·필수 config 정상 | traffic 제외 |
| `/demo` | 정적 page·fixture load | 제출 경로 장애 |

LLM·Safe Browsing 장애는 readiness를 실패시키지 않습니다. fallback 비율로 관찰합니다.

## 7. 모니터링

필수 dashboard/alert:

- 공개 web·API uptime
- 5xx와 P95 latency
- PostgreSQL connection·storage
- outbox pending·retry·failed
- FCM send accepted·invalid token
- Safe Browsing timeout·fallback
- LLM timeout·template fallback
- demo scenario completion
- release version·risk policy version

문자 원문·전화번호·URL query는 dashboard와 error event에 포함하지 않습니다.

## 8. 장애 등급

| 등급 | 예 | 대응 |
|---|---|---|
| SEV-1 | 공개 데모 전체 불가, 데이터 노출 가능성 | 즉시 담당자 호출, 필요 시 기능 차단·secret 회전 |
| SEV-2 | 보호자 알림 전체 실패, API 주요 흐름 실패 | 15분 내 확인, dashboard 사건 유지·복구 |
| SEV-3 | LLM·Safe Browsing 일부 장애 | fallback 확인, provider 조사 |
| SEV-4 | 비핵심 UI·문구 오류 | 기록 후 다음 release |

## 9. 대표 장애 절차

### API down

1. provider status와 `/health/live` 확인
2. 최근 deploy·migration 확인
3. 이전 version rollback 가능 여부 확인
4. Android 로컬 경고와 브라우저 데모 독립 동작 확인
5. 복구 후 pending Android event와 outbox drain 확인

### PostgreSQL down

1. provider 상태·connection limit 확인
2. API readiness를 false로 유지
3. 자동 migration 또는 데이터 수정 금지
4. 복구 후 migration 상태·outbox·중복 이벤트 확인

### FCM failure

1. credential·quota·provider 상태 확인
2. outbox가 retry 중인지 확인
3. 30초 넘은 PROCESSING lease가 recovery sweep으로 PENDING 복귀하는지 확인
4. incident가 dashboard에 유지되는지 확인
5. invalid token과 일시 오류를 구분
6. 사용자 화면에 전송 실패 상태 표시
7. 원인이 해결된 FAILED 건만 `pnpm --filter api outbox:replay --id <outbox-id>`로 재처리하고 감사 로그 확인

### 외부 평판·LLM failure

1. timeout이 적용되는지 확인
2. `FINALIZED_PARTIAL` 또는 template으로 완료되는지 확인
3. 장애가 CallScreening을 지연시키지 않는지 확인
4. 복구 후 자동 재판정 여부는 정책에 따라 별도 결정

## 10. Rollback

- web: 이전 저장 version 재배포
- API: 이전 container image 재배포
- DB: 이미 적용된 forward migration을 임의로 되돌리지 않음
- risk policy: 마지막 정상 signed bundle 활성화
- KISA snapshot: 마지막 정상 snapshot으로 pointer 변경
- LLM: `LLM_PROVIDER=template`로 비활성

Rollback 후 version·migration·policy 조합을 기록합니다.

## 11. Backup·복구 훈련

공급자 선정 후 작성:

| 항목 | 값 |
|---|---|
| 자동 backup 주기 | `TO_BE_FILLED` |
| PITR 지원 | `TO_BE_FILLED` |
| RPO 목표 | 대회 MVP: `TO_BE_FILLED` |
| RTO 목표 | 대회 MVP: `TO_BE_FILLED` |
| 마지막 restore drill | `NOT_RUN` |
| backup 소거 기한 | `TO_BE_FILLED` |

복구 훈련은 합성 staging 데이터로 수행합니다.

## 12. 운영 교대

| 역할 | 1차 | 2차 |
|---|---|---|
| 배포·API·DB | 풀스택 개발자 | `TO_BE_FILLED` |
| 공개 데모·콘텐츠 확인 | 기획·디자인 | 풀스택 개발자 |
| 제출 기간 상태 확인 | 공동 | - |

운영 기간의 확인 시간, 연락 방식과 응답 불가 시간은 release 전에 합의합니다.

## 13. 운영 종료

- 필요 없는 외부 API key 회전·폐기
- 테스트 계정·push subscription 정리
- 운영 데이터 보존·삭제 정책 실행
- production 비용 resource 정리
- 실제 지표와 장애 회고
- 제출 artifact와 문서 snapshot 보관

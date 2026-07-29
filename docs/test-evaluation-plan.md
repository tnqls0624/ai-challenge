# 돈워리 테스트·평가 계획

> 상태: smoke fixture 자동 평가 구현, frozen dataset·실기기·staging 평가 대기
>
> 관련 문서: [시나리오](scenarios.md) · [위험 판정](risk-spec.md) · [Android 스파이크](android-spike.md)

## 1. 목적

기능이 동작하는지뿐 아니라 정상 사용자를 과도하게 경고하지 않는지, 위험 근거가 재현 가능한지, 외부 장애 중에도 핵심 흐름이 유지되는지를 검증합니다. 제출 문서에는 이 문서의 목표값이 아니라 실제 측정값만 기록합니다.

## 2. 테스트 층

| 층 | 대상 | 도구 |
|---|---|---|
| Unit | RiskEngine, 상태 전이, redaction, parser | Vitest/Jest, JUnit |
| Integration | Prisma/PostgreSQL, auth, outbox, adapter | Supertest, Testcontainers |
| Contract | OpenAPI client, 외부 adapter schema | generated client compile, mock server |
| Component | Next.js·Compose 화면 상태 | Testing Library, Compose UI Test |
| E2E | 보호자·Android·데모 수직 흐름 | Playwright, Android instrumented |
| Device | Notification/Call/notification | Samsung 실기기 |
| Evaluation | 위험 수준·근거·LLM 설명 | 고정 test dataset |
| Operations | deploy·migration·rollback·장애 | staging drill |

## 3. 핵심 E2E 6개

1. 보호자 로그인 → 대상자 생성 → 6자리 활성화 → 동의
2. 문자 입력 → 로컬 경고 → 서버 최종 판정 → CRITICAL 웹 푸시
3. 의심 문자 → 연관 전화 → 통화 후 설문 → Incident → 대응 완료
4. 대상자 25명 → 우선순위 정렬 → 전화 → RESOLVED
5. 공개 데모 → 6개 시나리오 → 분석 근거 → 대응 체크리스트
6. Safe Browsing·LLM·FCM 장애 → fallback·재시도·명확한 상태

## 4. 위험 판정 평가

### 집합 분리

```text
scenario families
  ├─ authoring
  ├─ validation
  └─ frozen test
```

문장 변형이 다른 집합으로 새어 들어가지 않게 family 단위로 분리합니다.

### 지표

| 지표 | 정의 | 기획 목표 |
|---|---|---:|
| 위험 Recall | 실제 HIGH/CRITICAL 중 HIGH 이상 비율 | 90% 이상 |
| 위험 Precision | HIGH 이상 판정 중 실제 위험 비율 | 85% 이상 |
| 정상 오탐률 | 정상 중 CAUTION 이상 비율 | 10% 이하 |
| 악성 URL Recall | 검증 fixture 악성 URL 중 HIGH 이상 | 95% 이상 |
| 근거 없는 경고 | 판정 수준을 설명할 signal이 없는 비율 | 3% 이하 |
| UNKNOWN 적절성 | 정보 부족 fixture를 SAFE로 만들지 않은 비율 | 100% |

각 지표에 분모와 실패 case ID를 함께 저장합니다. 표본이 작은 경우 백분율만 제시하지 않고 `성공/전체`를 병기합니다.

## 5. 경계·불변조건

- 점수 29/30/59/60/79/80/100
- 악성 URL 35점이 강제 규칙으로 HIGH가 됨
- 비밀정보 요구 25점이 HIGH가 됨
- 송금+기관 사칭이 CRITICAL
- 앱 설치+원격 제어가 CRITICAL
- 입력 부족이 UNKNOWN
- 같은 정책과 입력에서 API·웹 결과 동일
- Android Kotlin이 공통 강제 규칙 fixture 통과
- LLM이 level·score·signal을 변경하지 못함

## 6. 성능

| 지표 | 시작·종료 | 목표 |
|---|---|---:|
| 로컬 문자 경고 | callback 수신→notification 게시 | P95 1초 |
| CallScreening | callback→`respondToCall` | P95 500ms, hard 2초 |
| 핵심 API | server receive→response, 외부 제외 | P95 500ms |
| Safe Browsing | adapter call | timeout 1,200ms |
| 최종 분석 | server receive→template result | P95 3초 |
| outbox 시작 | commit→worker claim | P95 2초 |
| 열린 dashboard | incident commit→다음 poll 반영 | 최대 약 5초+API |

FCM 기기 표시 시간은 외부 채널이라 상한으로 보장하지 않고 outbox 생성·FCM 수락·service worker 수신을 나눠 기록합니다.

## 7. 개인정보·보안 테스트

| Case | 기대 |
|---|---|
| 비연결 보호자 조회 | 404/403, 데이터 없음 |
| MINIMAL 응답 | 번호·행동 상세·원문 없음 |
| 동의 철회 직후 outbox 실행 | 전송 안 됨 |
| 탈퇴 후 token 재사용 | 인증 실패 |
| 활성화 brute force | 429 |
| P0 두 번째 보호자 활성화 | 422 `FEATURE_NOT_AVAILABLE` |
| URL private IP·metadata | 차단 |
| 악성 prompt fixture | 판정·근거 오염 없음 |
| Sentry/log snapshot | 금지 데이터 없음 |
| demo dependency graph | 운영 client import 없음 |
| P1 raw grant 교차 연결 접근 | 404/403, 원문 없음 |
| P1 raw grant 동시 2회 조회 | 한 요청만 성공, 이후 ciphertext 없음 |
| P1 raw grant 만료·철회 | 즉시 조회 불가·원문 삭제 |

## 8. Outbox 장애 주입

1. FCM timeout → backoff 재시도
2. FCM invalid token → 영구 실패·token 비활성 후보
3. FCM 성공 직후 process 종료 → 중복 전송 가능, UI 중복 표시 없음
4. 동의 철회와 worker 경쟁 → 전송 전 재검증
5. 같은 incident version 두 번 enqueue → unique dedupe
6. PROCESSING 상태에서 worker 종료 → 30초 lease 후 PENDING 복구
7. 6회 소진 → FAILED, 운영 replay 전까지 자동 재시도 없음

## 9. LLM 평가

LLM은 선택적 설명 보강만 평가합니다.

| 기준 | 통과 |
|---|---|
| 근거 충실성 | 모든 문장이 입력 signal에 근거 |
| 수준 불변 | risk level 변경 문구 없음 |
| 쉬운 한국어 | 전문용어 없이 짧은 문장 |
| 행동 가능성 | 지금 할 행동 하나 이상 |
| 금지 표현 | 100% 확정·비난·공포 조장 없음 |
| schema | 길이·필드·문장 수 제한 충족 |

실패하면 template 결과를 사용합니다.

## 10. 사용자 테스트

보호 대상자 또는 유사 사용자:

- 첫 화면에서 위험 이유를 말할 수 있는가
- 지금 하지 말아야 할 행동을 말할 수 있는가
- 확인 요청과 긴급 대응을 구분하는가
- 권한 거부 후 직접 확인을 찾을 수 있는가

보호자:

- 25명 중 우선 대응 대상을 고를 수 있는가
- 긴급 알림과 일반 확인 요청을 구분하는가
- 전화와 체크리스트 완료 이력을 남길 수 있는가

기획 목표:

- 위험 경고 이해도 80% 이상
- 데모에서 보호자·공식기관 확인 행동 전환 90% 이상

표본 수, 질문, 성공 기준과 실제 결과를 함께 기록합니다.

## 11. CI gate

Pull Request:

- lint·typecheck
- unit·integration
- risk golden fixtures
- OpenAPI diff·generated client compile
- Prisma migration dry-run
- secret scan
- demo forbidden import check
- Markdown link check

Release:

- Android 실기기
- 핵심 E2E 6개
- staging migration·smoke
- 외부 장애 주입
- 개인정보 삭제·redaction
- 공개 URL과 APK artifact

## 12. 결과 보고 형식

```text
Test run:
commit:
environment:
policy version:
dataset version:
started/finished:

metric:
numerator/denominator:
value:
failed case IDs:
known limitations:
artifact links:
```

실패 case를 삭제해 지표를 높이지 않습니다. 정책을 바꿨으면 같은 frozen test로 이전·이후 결과를 함께 제시합니다.

## 13. 현재 자동 평가 스냅샷

`/demo/evaluation`은 공개 데모와 같은 합성 fixture 6건을 브라우저의 공통 RiskEngine으로
다시 계산합니다.

| 항목 | 2026-07-28 결과 |
|---|---:|
| 예상 수준 exact match | 6 / 6 |
| HIGH·CRITICAL smoke Recall | 4 / 4 |
| SAFE smoke 오탐 | 0 / 2 |
| 위험 fixture signal 보유 | 4 / 4 |

이는 데이터 파이프라인·정책 재현을 확인하는 smoke set이며 성능 수치의 근거가 아닙니다.
기획 목표와 비교하는 Recall·Precision은 family 분리된 frozen dataset을 확보한 뒤 별도
실행합니다. 화면은 375×812와 1280×720에서 가로 overflow 없이 렌더링되고 콘솔 오류 없이
평가→데모 이동을 통과했습니다.

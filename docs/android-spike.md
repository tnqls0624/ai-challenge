# Android 기술 스파이크 기록

> 상태: `PARTIAL_VERIFIED` — API 29·36 에뮬레이터 통과, Samsung 실기기 대기
>
> 목표: gate형 P0 자동 감지의 실제 지원 범위와 fallback을 Phase 0에서 확정
>
> 관련 문서: [인프라 아키텍처](infrastructure-architecture.md) · [화면 IA](ia.md) · [기능명세서](기능명세서.md)
>
> 실행일: 2026-07-28

현재 결정은 **자동 문자·전화 감지를 조건부 P0로 유지**하는 것입니다. 에뮬레이터에서 API 계약과 최소·최신 OS 동작은 통과했지만, 주 데모 조합인 Samsung Messages·Samsung Phone을 아직 검증하지 않았으므로 제출 기능을 `VERIFIED`로 확정하지 않습니다.

## 1. 스파이크 종료 산출물

- 지원 Android 버전
- 검증 기기 모델과 OS build
- 기본 메시지·전화 앱 조합
- Notification Listener 본문 획득률
- CallScreening callback과 응답시간
- 통화 종료 후 설문 진입 가능 방식
- 고우선순위 알림·경고 Activity 표시 결과
- 기능별 P0 유지·fallback·P1 결정

## 2. 시간 제한

최초 스파이크는 개발 8시간을 넘기지 않습니다. 제한 시간 안에 안정성을 입증하지 못한 자동 기능은 공유·붙여넣기·수동 번호 검사 또는 웹 합성 시나리오로 대체합니다.

공유·붙여넣기 문자 분석과 수동 번호 확인은 스파이크 결과와 무관한 core P0입니다. 자동 감지는 아래 gate를 통과한 기능만 `기능명세서.md`에서 `VERIFIED` 후보로 유지합니다.

## 3. 환경 매트릭스

| ID | 기기 | Android | 메시지 앱 | 전화 앱 | 목적 | 결과 |
|---|---|---:|---|---|---|---|
| `ENV-01` | Samsung 실기기 | 14 이상 | Samsung Messages | Samsung Phone | 주 APK 데모 | `BLOCKED` — 연결 기기 없음 |
| `ENV-02` | Medium Phone AVD | 10/API 29 | 앱 합성 fixture | AOSP Phone | 최소 지원 | `PASS` |
| `ENV-03` | Medium Phone AVD | 16/API 36 | 앱 합성 fixture | AOSP Phone | 최신 호환성·제한 | `PASS` |

실제 사용할 Samsung 모델·OS build는 테스트 시작 시 기록합니다.

### 3-1. 빌드 산출물

| 항목 | 결과 |
|---|---|
| 코드 | `apps/android` 최소 네이티브 스파이크 앱 |
| Android 범위 | `minSdk 29`, `targetSdk 36`, `compileSdk 36` |
| 도구 | Kotlin 2.2.10, AGP 8.13.2, Gradle 8.14.5, JDK 21 |
| 단위 테스트 | 10/10 통과 — 알림 추출 7건, 정책 3건 |
| Lint | `No issues found` |
| Debug APK | `apps/android/app/build/outputs/apk/debug/app-debug.apk` |
| APK 크기 | 2,542,332 bytes |
| SHA-256 | `9a201e3688574e8154a8382631abc1b4a579aa959417fed01d7c1b0bac989d8b` |

## 4. NotificationListenerService

### Notification 확인 항목

- 사용자가 알림 접근 설정을 완료할 수 있음
- 허용 메시지 package만 처리
- 제목·본문·확장 본문 후보 추출
- 본문 없음·잘림·OTP 가림을 구분
- 중복 게시·수정 알림을 하나의 이벤트로 처리
- 문자 원문을 로그에 남기지 않음
- 공유·붙여넣기 대체 경로가 바로 노출됨

### fixture

| Case | 기대 |
|---|---|
| 단일 본문 | sender·text 후보 추출 |
| 여러 줄 본문 | 순서 보존 |
| 본문 누락 | `CONTENT_UNAVAILABLE` |
| 본문 잘림 | `CONTENT_PARTIAL` |
| OTP 가림 | 원문 추측 금지 |
| 알림 수정 | 동일 event id 병합 |
| 허용 외 앱 | 무시 |

### Gate

- 주 데모 기기·메시지 앱에서 정상 fixture 10회 중 9회 이상 동일 추출
- crash·ANR 0
- 누락을 SAFE로 처리하지 않음
- 실패 시 수동 경로가 2탭 이내

Gate 실패 시 자동 문자 감지를 실험 기능으로 표시하고 공유·붙여넣기를 P0 기본으로 전환합니다.

### 4-1. 실행 결과

| 항목 | API 29 | API 36 |
|---|---:|---:|
| 알림 접근 권한·service 연결 | PASS | PASS |
| 합성 fixture 10회 | 10/10 | 10/10 |
| 동일 event 병합 | 최초 게시 1 + 수정 9 | 최초 게시 1 + 수정 9 |
| 본문 상태 | `FULL` | `FULL` |
| 본문 길이·일치 | 25자·일치 | 25자·일치 |
| crash·ANR | 0 | 0 |

단위 테스트에서 단일·확장·여러 줄·본문 누락·잘림·민감정보 가림·messaging style과 허용 package를 확인했습니다. 누락은 `UNAVAILABLE`, 잘림은 `PARTIAL`로 남고 안전 판정으로 승격되지 않습니다.

에뮬레이터 결과만 보면 기술 gate를 통과했습니다. 다만 Samsung Messages의 실제 알림 payload와 실패 시 공유·붙여넣기 2탭 경로는 아직 검증하지 않았으므로 **전체 gate는 `PENDING_ENV_01`**입니다.

## 5. CallScreeningService

### CallScreening 확인 항목

- role 요청과 승인
- 주소록 밖 수신 callback
- 번호 정규화
- Room index와 최근 의심 이벤트 조회
- 네트워크 없이 allow/silence 응답
- 등록된 데모 번호만 block
- callback·판정·`respondToCall` 시각 계측

### 성능 Gate

| 지표 | 기준 |
|---|---|
| 내부 P95 | 500ms 이하 |
| hard timeout | 2초 |
| Android API 응답 | 공식 제한 5초 이전 |
| callback 누락 | 주 데모 조합 20회 중 0회 |

Gate 실패 시 수동 번호 검사와 웹의 합성 전화 이벤트를 사용하고 실전화 자동 연관을 P1으로 내립니다.

### 5-1. 실행 결과

| 항목 | API 29 | API 36 |
|---|---:|---:|
| `ROLE_CALL_SCREENING` | PASS | PASS |
| 등록 fixture 번호 callback | 20/20 | 20/20 |
| 내부 처리시간 | 20회 모두 0ms | 0~11ms |
| P95 gate 500ms | PASS | PASS — 관측 최대 11ms |
| hard timeout 2초 | 초과 0 | 초과 0 |
| 등록 fixture 번호만 block | PASS | PASS |
| 미등록 번호 allow | PASS | PASS |

측정 구간은 `onScreenCall` 진입부터 로컬 hash 판정과 `respondToCall` 반환까지입니다. 네트워크를 호출하지 않으며 원번호 대신 hash prefix와 판정·시간·누적 callback만 저장합니다.

Samsung Phone과 실제 통신사 수신 경로의 callback 누락 여부는 **`PENDING_ENV_01`**입니다.

## 6. 통화 후 설문

확인할 후보:

- call state 변화 후 앱 알림
- 최근 screening event와 종료 시각 연관
- 사용자가 알림을 눌러 설문 진입
- OS가 허용하지 않는 자동 Activity 실행에 의존하지 않음

Gate:

- 주 데모 조합에서 종료 이벤트를 안정적으로 식별
- 같은 통화에 설문 1회
- 놓친 경우 홈의 “최근 통화 확인”으로 복구

### 6-1. 실행 결과

- API 29·36에서 미등록 합성 전화는 allow되고 통화 중 고우선순위 경고가 게시됐습니다.
- `gsm cancel`의 `IDLE` 전환 뒤 `pending_survey`가 `true → false`로 소비되고 설문 알림 `id=301`이 게시됐습니다.
- 설문 알림 탭은 `PostCallSurveyActivity`로 진입했습니다.
- 실제 Samsung 종료 이벤트와 홈의 “최근 통화 확인” 복구 화면은 아직 검증·구현 전입니다.

## 7. 경고 표시

| 방식 | P0 위치 |
|---|---|
| 고우선순위 notification channel | 필수 |
| 탭 후 Warning Activity | 필수 |
| heads-up 표시 | 실기기 검증 |
| full-screen intent | 조건부, P0 완료 조건 아님 |
| overlay | 사용하지 않음 |

Android 14 이상에서 full-screen intent는 제한될 수 있으므로 기본 경로는 항상 notification입니다.

### 7-1. 실행 결과

- API 29·36에서 `risk-warning` channel의 importance 4(`HIGH`)를 확인했습니다.
- 경고 알림 `id=201`과 설문 알림 `id=301` 모두 `contentIntent`가 있고 `fullscreenIntent=null`입니다.
- API 36에서 경고 알림 탭 후 `WarningActivity`, 설문 알림 탭 후 `PostCallSurveyActivity` 진입을 확인했습니다.
- heads-up 표시 형태는 제조사·사용자 설정 영향을 받으므로 Samsung 실기기에서 최종 확인합니다.
- full-screen intent는 요청하지 않으며 P0 완료 조건에서 제외합니다.

## 8. 오프라인·재전송

- 이벤트를 먼저 Room에 저장
- UI에 `PROVISIONAL` 표시
- WorkManager에 unique work 등록
- 같은 `eventId`와 `Idempotency-Key`로 재전송
- 성공 후 local status 갱신
- 앱 재시작·기기 재부팅 후 pending 유지

검증:

1. 비행기 모드에서 문자 입력
2. 로컬 경고 확인
3. 앱 종료·재실행
4. 네트워크 복구
5. 서버 이벤트 하나만 생성

## 9. 개인정보 점검

- logcat에 원문·번호·URL query 없음
- screenshot·최근 앱 화면에서 민감정보 노출 최소화
- Keystore credential은 backup 대상 제외
- debug menu와 release build 분리
- fixture만 demo 번호로 사용

실행 확인:

- API 29·36에서 앱 PID logcat을 대상으로 합성 문자 원문·전체 fixture 번호·crash·ANR를 검색한 결과 0건이었습니다.
- 앱 telemetry에는 본문·발신자 hash, 본문 길이, 번호 hash prefix, 판정, 처리시간만 저장됩니다.
- 이 스파이크는 네트워크·외부 API·실사용자 데이터를 사용하지 않았습니다.

## 10. 결과 기록

| 기능 | 결과 | P0 결정 | fallback | 근거 |
|---|---|---|---|---|
| Notification Listener | `EMULATOR_PASS` | 조건부 유지, Samsung 대기 | 공유·붙여넣기 | API 29·36 각 10/10, unit 7/7 |
| Call Screening | `EMULATOR_PASS` | 조건부 유지, Samsung 대기 | 수동 번호 검사·웹 데모 | API 29·36 각 20/20, 최대 11ms |
| 통화 후 설문 | `EMULATOR_PASS` | 조건부 유지, Samsung 대기 | 홈의 최근 통화 확인 | IDLE 소비·알림 탭 확인 |
| 고우선순위 알림 | `EMULATOR_PASS` | 필수 유지 | 앱 내 최근 결과 | importance 4, Activity 탭 확인 |
| full-screen intent | `NOT_USED` | P0 제외 | 고우선순위 알림 | API 36 허용 false, intent null |

### 10-1. 남은 종료 조건

1. Samsung Android 14 이상 실기기 모델·OS build 기록
2. Samsung Messages 정상·누락·잘림 fixture와 10회 추출
3. Samsung Phone 수신 20회 callback·P95·종료 설문 확인
4. 권한 거부 후 공유·붙여넣기 fallback이 2탭 이내인지 확인
5. heads-up 시인성과 고령자 사용성 확인

위 항목이 통과되면 `VERIFIED`로 승격하고 `PRD.md`, `ia.md`, `기능명세서.md`, `demo-guide.md`를 함께 갱신합니다. 실패하면 자동 기능을 P1·실험 기능으로 내리고 core P0인 공유·붙여넣기와 수동 번호 검사를 유지합니다.

## 11. 공식 근거

- [NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
- [CallScreeningService](https://developer.android.com/reference/android/telecom/CallScreeningService)
- [Android 16 테스트 환경](https://developer.android.com/about/versions/16/get)
- [긴급 알림과 full-screen intent](https://developer.android.com/develop/ui/compose/notifications/create-notification)
- [Android 14 full-screen intent 변경](https://developer.android.com/about/versions/14/behavior-changes-14)

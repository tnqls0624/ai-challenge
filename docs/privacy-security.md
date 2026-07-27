# 돈워리 개인정보·보안 사양

> 상태: MVP 구현 기준 초안
>
> 주의: 법률 자문 문서가 아니라 제품·구현 기준입니다. 제출 전 실제 운영 지역과 공급자 약관을 기준으로 검토합니다.
>
> 관련 문서: [백엔드 사양](backend-spec.md) · [알림 정책](alert-policy.md) · [인프라 아키텍처](infrastructure-architecture.md)

## 1. 원칙

1. 기기 권한과 제품 동의를 분리합니다.
2. 보호 기능에 필요하지 않은 원문은 기본 수집하지 않습니다.
3. 보호자에게는 연결별 공유 수준보다 많은 정보를 보여주지 않습니다.
4. 동의 철회는 새 조회와 알림에 즉시 반영합니다.
5. 안전을 이유로 대상자의 자기결정권과 삭제권을 제거하지 않습니다.
6. 통화 음성, 전체 연락처, 계좌정보를 수집하지 않습니다.

## 2. 기기 권한

| 권한·역할 | 목적 | 필수 여부 | 거부 시 |
|---|---|---|---|
| 알림 접근 | 허용 메시지 앱의 알림 후보 분석 | 자동 문자 감지에만 필요 | 공유·붙여넣기 제공 |
| 전화 스크리닝 역할 | 수신번호 로컬 확인 | 자동 전화 확인에만 필요 | 수동 번호 검사·웹 데모 |
| 알림 표시 | 로컬 위험 경고 | 보호 기능에 필요 | 설정 안내, 앱 내 결과 유지 |
| 네트워크 | 서버 최종 분석·동기화 | 선택적 연결 기능 | 로컬 임시 결과·재전송 |

권한 요청 전에 목적과 대체 기능을 설명합니다. 여러 권한을 한 번에 요청하지 않습니다.

## 3. 동의 항목

| ID | 동의 | 기본값 | 철회 효과 |
|---|---|:---:|---|
| `CARE_CONNECTION` | 지정 보호자와 연결 | 꺼짐 | 보호자 조회·새 알림 즉시 중단 |
| `AUTO_GUARDIAN_ALERT` | 연결별 HIGH 또는 CRITICAL 자동 보호자 알림 | 꺼짐 | 이후 해당 연결의 자동 알림 중단 |
| `RAW_SERVER_ANALYSIS` | 문자 원문을 서버 요청 메모리에서 분석 | 꺼짐 | 이후 원문 전송 중단 |
| `RAW_GUARDIAN_SHARE` | P1에서 특정 사건 원문을 지정 보호자에게 15분·1회 공유 | 사건별 꺼짐 | 활성 공유 원문 즉시 삭제 |
| `MODEL_IMPROVEMENT` | 비식별 검수 데이터를 개선에 사용 | 꺼짐 | 이후 학습 후보 제외 |

각 동의는 `consentTextVersion`, actor, device, 동의·철회 시각을 기록합니다.

연결 승인은 기기 활성화에 필요하지만 자동 알림은 선택입니다. 자동 알림을 거부해도 연결·로컬 경고·대상자의 수동 확인 요청은 동작합니다.

자동 알림은 다음 두 설정의 교집합에서만 보냅니다.

- 대상자: 연결별 `autoAlertThreshold = NONE | HIGH | CRITICAL`
- 보호자: 연결별 `receiveThreshold = REQUEST_ONLY | HIGH | CRITICAL`
- 실제 자동 임계값: 양측 중 더 제한적인 수준. 대상자가 `NONE`이면 자동 전송 없음

`꼼꼼하게` 프리셋은 대상자에게 `HIGH` 동의를 권장할 뿐 동의를 대신하지 않습니다. 보호자가 임계값을 낮춰도 대상자가 승인한 범위를 넓힐 수 없습니다.
대상자의 threshold와 `consentTextVersion`은 하나의 versioned mutation·transaction으로 기록하며 서로 독립적으로 변경하지 않습니다.

## 4. 공유 수준

| 수준 | 보호자가 볼 수 있는 데이터 |
|---|---|
| `MINIMAL` | 위험 수준, 이벤트 유형, 발생 시각 |
| `BASIC` | MINIMAL + 마스킹 번호, 행동 신호, 사건 단계 |
| `EXTENDED` | P1. BASIC + 대상자가 사건별 승인한 15분·1회 문자 원문 |

- 자녀·친지 기본값: `MINIMAL`
- 생활지원사 기본값: `BASIC`
- P0는 대상자당 보호자 1명과 MINIMAL/BASIC만 구현합니다.
- P1 원문 공유는 EXTENDED 설정만으로 충분하지 않고, 사건·연결별 승인도 필요합니다.
- 한 보호자에게 승인한 원문은 다른 연결의 보호자에게 공개하지 않습니다.
- 통화 음성, 전체 연락처, 계정·인증 정보는 모든 수준에서 금지합니다.

## 5. 데이터 처리표

| 데이터 | 수집 위치 | 서버 저장 | 보호자 공유 |
|---|---|---|---|
| 문자 원문 | Android | P0 서버 분석은 요청 메모리에서 폐기. P1 보호자 공유만 암호화 grant로 최대 15분 | P0 공유 없음 |
| 위험 특징 | Android/API | 30일 | 공유 수준에 따라 |
| URL | Android/API | 정규화 domain·hash 중심 30일 | query 제거·마스킹 |
| 전화번호 | Android/API | 서버 HMAC hash + masked 값 30일, 원번호는 평판 조회 요청에서만 처리 | masked 값 |
| 통화 음성 | 수집 안 함 | 없음 | 없음 |
| 전체 연락처 | 서버 전송 안 함 | 없음 | 없음 |
| 계좌번호 | 탐지 즉시 마스킹 | 원문 없음 | 없음 |
| 웹 푸시 token | 보호자 브라우저 | 암호화, 구독 종료까지 | 없음 |
| device credential | Android/API | hash·상태 | 없음 |

## 6. 보존·삭제

| 데이터 | 보존 |
|---|---|
| 일반 위험 이벤트 | 30일 |
| 사용자가 보존한 사건 | 연결 유지 중 또는 사용자 삭제까지 |
| 브라우저 데모 상태 | sessionStorage 종료 또는 최대 24시간 |
| 비식별 평가 로그 | 90일 |
| 감사 로그 | 90일, 탈퇴 시 식별자 가명화 |
| 문자 원문 | P0 기본 미저장. P1 보호자 공유 grant만 첫 조회 또는 최대 15분 |

삭제 동작:

```text
consent withdrawn
  → new reads/alerts blocked immediately
  → active raw-share ciphertext deleted immediately

connection revoked
  → access blocked immediately
  → connection-scoped data deleted within 30 days

account deleted
  → primary personal/event data deleted immediately
  → credentials and push subscriptions revoked
  → backup ages out within provider limit
```

`RAW_SERVER_ANALYSIS`는 요청 메모리에서 처리한 뒤 폐기합니다. P1의 `RAW_GUARDIAN_SHARE`는 별도 승인 후 `RawShareGrant`에 애플리케이션 계층 암호화하며, 첫 조회·15분 만료·철회·연결 해제 중 가장 이른 시점에 ciphertext를 삭제합니다. 응답은 `Cache-Control: no-store`이고 푸시·로그·분석 도구에는 원문을 넣지 않습니다.

### URL 평판의 제3자 전송

- URL은 HTTP(S)만 허용하고 userinfo와 fragment를 제거하며 private·loopback·metadata 주소를 차단합니다.
- KISA snapshot·자체 도메인 규칙은 domain과 canonical hash로 조회합니다.
- Safe Browsing direct lookup을 사용할 때는 판정에 필요한 canonical URL과 query가 Google에 전송될 수 있음을 개인정보 안내에 명시합니다.
- 전송 URL은 우리 로그·DB·오류 추적에 남기지 않고 응답 후 폐기합니다.
- 공급자의 보존·cache·처리 조건을 `data-sources.md`에 승인 기록하기 전에는 production adapter를 활성화하지 않습니다.
- 조건이 불명확하거나 사용자가 외부 조회를 허용하지 않는 배포에서는 KISA·로컬 규칙만 사용하고 미확인 상태를 표시합니다.

## 7. 인증·credential

- 보호자 비밀번호와 refresh token을 저장하지 않습니다.
- Firebase ID token의 issuer, audience, signature, expiry를 검증합니다.
- device credential은 Android Keystore에 저장하고 서버에는 hash만 둡니다.
- 활성화 코드는 10분·1회·시도 제한을 적용합니다.
- 웹 푸시 token은 애플리케이션 수준 암호화와 보호자 계정 바인딩을 적용합니다.
- 분실 기기·연결 해제·탈퇴 시 관련 credential을 즉시 revoke합니다.

## 8. 로그·관찰성

기록 가능:

- correlation ID
- `RiskEvent`, `Incident`, `NotificationOutbox` ID
- 위험 수준·정책 버전
- 외부 adapter latency·오류 분류
- 권한 상태 enum

기록 금지:

- 문자 원문
- 전체 전화번호
- URL query·fragment
- 계좌·인증번호
- Authorization header
- Firebase token·device credential

Sentry request body와 민감 header 수집을 비활성화하고 공통 redaction을 먼저 적용합니다.

## 9. 주요 위협과 통제

| 위협 | 통제 | 검증 |
|---|---|---|
| 비연결 보호자의 사건 조회 | CareConnection 조건을 쿼리에 포함 | authorization integration |
| 보호자 임계값이 대상자 동의를 초과 | 양측 임계값 교집합 | policy matrix test |
| 활성화 코드 brute force | 10분·1회·기기/IP rate limit | rate-limit test |
| 동의 철회와 전송 경쟁 | outbox 전송 직전 재검증 | race integration |
| 중복 Android 이벤트 | `(deviceId,eventId)` unique | retry test |
| FCM 중복 표시 | stable notification ID | worker crash test |
| P1 임시 원문 공유 탈취·재조회 | 연결별 grant, 15분 TTL, 1회 원자적 소비, no-store | authorization·race test |
| LLM prompt injection | 입력을 data로 취급, schema·근거 검사 | malicious fixture |
| URL SSRF | private·loopback·metadata 주소 차단 | URL parser test |
| 데모에서 운영 데이터 접근 | 운영 client import 금지, 브라우저 fixture만 사용 | dependency/E2E test |
| 로그 개인정보 유출 | redaction + body 비활성 | log snapshot test |
| 악성 신고 데이터 오염 | 자동 학습 금지, 검수 후 버전 반영 | provenance audit |

## 10. 보안 완료 조건

- 권한 거부 후 대체 경로가 동작
- 모든 동의의 승인·철회 E2E 통과
- P0 MINIMAL/BASIC 응답 snapshot 통과
- P1 구현 시 raw grant 교차 연결·만료·동시 조회·철회 테스트 통과
- 탈퇴 후 인증·push·상세 조회 불가
- 로그·Sentry에 금지 데이터가 없음
- 외부 API key가 APK·웹 bundle에 없음
- production·staging Firebase project와 secret 분리
- Android release signing key가 CI secret과 오프라인 백업에 저장

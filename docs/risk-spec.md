# 돈워리 위험 판정 사양

> 상태: MVP 구현 기준 초안
>
> 정책 버전: `2026-07-27.1`
>
> 관련 문서: [PRD](../PRD.md) · [알림 정책](alert-policy.md) · [시나리오](scenarios.md) · [인프라 아키텍처](infrastructure-architecture.md)

## 1. 목적

Android 로컬 판정, NestJS 최종 판정과 공개 웹 데모가 같은 용어·강제 규칙·경계값을 사용하도록 계약을 고정합니다. 이 문서는 모델 정확도를 주장하는 문서가 아니라 재현 가능한 판정 동작을 정의하는 문서입니다.

## 2. 출력 계약

```ts
type RiskLevel = 'SAFE' | 'CAUTION' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
type AnalysisConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
type AnalysisCompleteness = 'PROVISIONAL' | 'FINAL' | 'FINALIZED_PARTIAL';

interface RiskDecision {
  eventId: string;
  policyVersion: string;
  level: RiskLevel;
  score: number | null;
  category: RiskCategory | 'UNCLASSIFIED';
  confidence: AnalysisConfidence;
  completeness: AnalysisCompleteness;
  signals: RiskSignal[];
  recommendedActionIds: string[];
}
```

- `level`은 사용자가 취해야 할 행동의 강도입니다.
- `score`는 신호 합산 결과이며 `UNKNOWN`에서는 `null`일 수 있습니다.
- `confidence`는 근거의 확실성으로, 위험 수준과 별개입니다.
- `completeness`는 로컬 임시 결과인지, 외부 조회를 마친 결과인지 나타냅니다.
- 보호자 알림 여부는 RiskEngine이 아니라 동의·연결 설정을 포함한 Notification Policy가 결정합니다.

## 3. 입력 계약

Android가 API에 보내는 수집 envelope은 다음 형식을 사용합니다.

```json
{
  "schemaVersion": 1,
  "policyVersion": "2026-07-27.1",
  "eventId": "uuid",
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

`rawText`는 원문 서버 분석 동의를 받은 요청에서만 채우고 분석 요청 메모리에서 처리한 뒤 폐기합니다.

`sender.normalized`는 TLS로 전송해 번호 평판 조회에만 사용하고 로그·DB에 저장하지 않습니다. 서버는 조회 후 서버 비밀키 HMAC과 `masked` 값만 저장합니다. Android의 기기 키 HMAC은 로컬 상관관계에만 쓰며 서버 식별자로 재사용하지 않습니다.

`urls[].canonical`은 Safe Browsing direct lookup이 활성화된 요청에서만 TLS로 전송합니다. 서버는 userinfo·fragment·private 주소를 검증한 뒤 lookup에 사용하고 요청 종료 시 폐기합니다. DB와 로그에는 `normalizedDomain`과 `normalizedUrlHash`만 남깁니다.

내부 RiskEngine에는 원번호 대신 다음 형태를 전달합니다.

```json
{
  "sender": {
    "masked": "010-****-1234",
    "normalizedHash": "hmac-sha256-with-server-key"
  }
}
```

## 4. 점수 모델

각 그룹에서는 가장 높은 점수 하나만 적용합니다. 전체 점수는 0~100으로 제한합니다.

| 그룹 | 신호 | 점수 |
|---|---|---:|
| URL 평판 | 검증된 악성 URL | 35 |
| URL 평판 | 의심 도메인·공식 도메인 유사 사칭 | 20 |
| URL 평판 | 단축 URL 또는 비정상 URL 표현 | 10 |
| 위험 행동 요구 | 송금·결제·대출·현금 전달 | 25 |
| 위험 행동 요구 | 앱 설치·원격 제어 | 25 |
| 위험 행동 요구 | 인증번호·비밀번호·개인정보 | 25 |
| 사칭·압박 표현 | 기관·가족 사칭, 공포, 긴급성 | 15 |
| 전화 평판 | 검수된 신고 번호 일치 | 15 |
| 사건 연관 | 최근 의심 문자와 전화가 정책 시간창에서 연관 | 10 |

초기 수준 구간:

| 결과 | 점수 |
|---|---:|
| `SAFE` | 충분한 입력에서 0~29 |
| `CAUTION` | 30~59 |
| `HIGH` | 60~79 |
| `CRITICAL` | 80~100 |

이 구간은 초기 engineering 값입니다. 라벨 데이터로 조정할 때는 반드시 정책 버전을 올리고 이전 golden fixture 결과 차이를 검토합니다.

## 5. 강제 규칙

강제 규칙은 점수 구간보다 우선합니다.

| 조건 | 최소 결과 |
|---|---|
| 검증된 악성 URL | `HIGH` |
| 인증번호·비밀번호 등 비밀정보 요구 | `HIGH` |
| 위험 행동 요구가 하나라도 있음 | `CAUTION` |
| 의심 domain 또는 검수된 신고 번호 | `CAUTION` |
| 사칭·공포·긴급성 표현이 확인됨 | `CAUTION` |
| 송금·결제 요구 + 기관·가족 사칭 | `CRITICAL` |
| 앱 설치 요구 + 원격 제어 또는 비밀 유지 요구 | `CRITICAL` |
| 송금 완료를 사용자가 확인 | `CRITICAL`, 사건 단계 `S4` |

강제 규칙이 여러 개면 가장 높은 결과를 사용합니다. Android 로컬 강제 규칙이 만든 수준은 서버가 자동으로 낮추지 않습니다.

## 6. UNKNOWN과 부분 결과

다음은 `UNKNOWN`입니다.

- 지원하지 않는 `schemaVersion`
- 본문·특징·평판 중 판정할 정보가 없고 공식 발신자라는 근거도 없음
- 전화번호가 없거나 비공개이며 연관 이벤트도 없음
- 필수 정규화 실패
- 외부 조회 실패 후 로컬 신호만으로 안전·위험을 판단할 수 없음

`UNKNOWN`은 SAFE가 아닙니다. 추가 확인이 필요한 이유와 수동 입력·공식기관 확인·보호자 확인 요청 경로를 제공합니다.

`FINALIZED_PARTIAL` 처리:

- 강제 규칙은 그대로 적용합니다.
- 외부 조회 없이도 근거가 충분한 HIGH·CRITICAL은 유지합니다.
- 긍정 위험 신호가 부족하면 `CAUTION` 또는 `UNKNOWN`으로 제한합니다.
- 사용자에게 확인하지 못한 출처를 명시합니다.

### 충분한 입력의 최소 조건

`SAFE`는 단순히 신호 점수가 0이라는 이유만으로 반환하지 않습니다.

| 이벤트 | `SAFE` 판정에 필요한 조건 |
|---|---|
| SMS·MANUAL | 지원 schema·정책, `contentAvailable=true`, 추출 완료, 잘리지 않은 정규화 본문 8자 이상, 모든 URL 확인 완료 또는 URL 없음 |
| URL | 유효한 HTTP(S) 정규화 성공, 평판 조회 완료, 위험 URL·도메인 신호 없음 |
| CALL | 검증된 공식 번호 또는 신뢰 가능한 정상 fixture. 평판·연관 정보가 없는 번호는 `UNKNOWN` |

검증된 정상 발신자·템플릿은 본문 길이 조건을 대신할 수 있지만 source version을 근거로 남깁니다. 본문이 가려졌거나 잘렸고 정상 출처도 확인되지 않으면 `UNKNOWN`입니다.

## 7. 로컬과 서버 판정

```text
Android
  입력 정규화
    → APK 내장/마지막 정상 정책
    → PROVISIONAL 결과
    → 즉시 로컬 경고
    → 이벤트 동기화

NestJS
  schema 검증
    → 공통 RiskEngine
    → KISA·Safe Browsing·전화 평판
    → FINAL 또는 FINALIZED_PARTIAL
    → Incident·Notification Policy
```

- CallScreening callback에서는 Room index와 로컬 정책만 사용합니다.
- 서버 결과가 더 높으면 Android 화면을 갱신합니다.
- 자동 하향은 금지하고 사용자 피드백 또는 관리자 정정 이력을 남깁니다.

## 8. 문자–전화 연관

초기 정책 시간창은 의심 문자 발생 후 30분입니다. 이는 “30분 보호 모드” UI 기능이 아니라 두 이벤트가 같은 사건인지 판단하는 correlation window입니다.

연관 조건:

- 같은 대상자 기기
- 문자 이후 전화
- 시간 차이 0~30분
- 문자에 기관 사칭·위험 행동·URL 신호 중 하나 이상 존재
- 전화가 주소록 밖이거나 공식 번호와 불일치

연관 신호만으로 CRITICAL을 만들지 않습니다. 다른 위험 신호와 합산합니다.

## 9. 보호자 알림 판정

| 조건 | 알림 |
|---|---|
| `CRITICAL` + 활성 연결 + 자동 알림 동의 | 자동 웹 푸시 |
| `HIGH` + `꼼꼼하게` 프리셋 | 자동 웹 푸시 |
| `HIGH`·`CAUTION`·`UNKNOWN` + 대상자 확인 요청 | 긴급도에 맞는 확인 요청 |
| `SAFE` | 없음 |
| 동의 철회·연결 비활성 | 없음 |

Notification Policy는 전송 직전에 연결·동의를 다시 확인합니다.

자동 알림은 대상자의 연결별 `NONE | HIGH | CRITICAL` 승인과 보호자의 `REQUEST_ONLY | HIGH | CRITICAL` 수신 임계값 중 더 제한적인 값을 적용합니다. 대상자가 `NONE`이면 자동 전송은 없고, 보호자 설정은 대상자의 승인 범위를 넓힐 수 없습니다. 대상자가 직접 만든 확인 요청은 활성 연결에 전달하되 보호자가 웹 푸시를 끈 경우 대시보드에만 남깁니다.

## 10. 설명 생성

결과에는 최대 3개 근거와 하나의 핵심 CTA를 제공합니다.

```text
결정적 signals
  → 검증된 템플릿
  → 즉시 사용자 설명
  → 선택적 LLM 문장 보강
  → schema·근거 충실성 검사
```

LLM은 `level`, `score`, `signals`, 알림 여부를 변경할 수 없습니다. timeout·형식 오류·근거 추가가 발생하면 템플릿만 사용합니다.

## 11. 정책 bundle

```json
{
  "version": "2026-07-27.1",
  "schemaVersion": 1,
  "issuedAt": "2026-07-27T00:00:00Z",
  "expiresAt": "2026-08-27T00:00:00Z",
  "checksum": "sha256",
  "signature": "base64"
}
```

- APK에 최소 정책을 포함합니다.
- 활성화 직후와 24시간마다 새 bundle을 확인합니다.
- checksum·서명을 검증한 뒤 원자적으로 교체합니다.
- 실패하면 마지막 정상 정책, 그것도 만료되면 APK 내장 정책을 사용합니다.

## 12. 구현 불변조건

- 같은 정책 버전과 입력은 API·웹 데모에서 같은 결과를 반환합니다.
- Kotlin 로컬 판정은 공통 golden fixture의 강제 규칙과 경계값을 통과합니다.
- 데이터 부족을 SAFE로 바꾸지 않습니다.
- 한 그룹의 여러 신호를 중복 합산하지 않습니다.
- 모든 결과에 `policyVersion`과 근거 출처를 남깁니다.
- 정책 변경은 `scenarios.md`의 기존 기대 결과 diff를 검토한 뒤 반영합니다.

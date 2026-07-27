# 돈워리 정상·위험 시나리오

> 상태: 초기 30건
>
> 관련 문서: [위험 판정](risk-spec.md) · [알림 정책](alert-policy.md) · [테스트·평가](test-evaluation-plan.md)

## 1. 사용법

각 시나리오는 제품 요구사항, `packages/risk-engine` golden fixture, Android 동등성 테스트와 공개 데모의 입력입니다.

필수 fixture 필드:

```yaml
id: SCN-001
family: delivery
input:
  type: SMS
  textFixture: delivery_normal_01
externalFixtures:
  urlReputation: NONE
expected:
  score: 0
  level: SAFE
  completeness: FINAL
  signalIds: []
  guardianAction: NONE
  incidentStage: S0
```

실제 개인정보·활성 악성 URL을 넣지 않습니다.

보호자 알림 기대값은 활성 `CareConnection`과 해당 연결의 자동 알림 동의가 유지된 상태를 전제로 합니다. 동의가 없거나 철회되면 사건은 유지하되 자동 푸시는 만들지 않습니다.

## 2. 전체 시나리오

| ID | 구분 | 입력 요약 | 핵심 신호 | 예상 결과 | 보호자·사건 |
|---|---|---|---|---|---|
| `SCN-001` | 정상 | 배송 완료 안내, URL 없음 | 없음, 충분한 본문 | SAFE 0 | 없음, S0 |
| `SCN-002` | 정상 | 본인이 사용한 카드 승인 알림 | 알려진 정상 발신 fixture | SAFE 0 | 없음, S0 |
| `SCN-003` | 정상 | 병원 예약 시간 안내 | 공식·등록 번호 fixture | SAFE 0 | 없음, S0 |
| `SCN-004` | 정상 | 공공기관 안내 + 검증된 공식 domain | official domain | SAFE 0 | 없음, S0 |
| `SCN-005` | 정상 | 가족의 일상 대화 | 위험 행동 없음 | SAFE 0 | 없음, S0 |
| `SCN-006` | 정상 | 은행 잔액 변동 안내, 링크 없음 | 알려진 정상 template | SAFE 0 | 없음, S0 |
| `SCN-007` | 미확인 | 메시지 앱이 본문을 제공하지 않음 | 입력 부족 | UNKNOWN | 수동 공유 안내 |
| `SCN-008` | 미확인 | 비공개 발신 전화, 연관 문자 없음 | 번호·평판 없음 | UNKNOWN | 확인 요청 가능 |
| `SCN-009` | 주의 | 개인 계좌로 입금 요청, 사칭 없음 | 위험 행동 25 | CAUTION 25 강제 | 사용자 경고 |
| `SCN-010` | 주의 | “공공기관입니다”만 있고 행동 요구 없음 | 기관 사칭 15 | CAUTION 15 강제 | 확인 요청 가능 |
| `SCN-011` | 주의 | 유사 공식 domain + 일반 안내 | 의심 domain 20 | CAUTION 20 강제 | 사용자 경고 |
| `SCN-012` | 주의 | 검수된 신고 번호에서 전화, 추가 행동 없음 | 신고 번호 15 | CAUTION 15 강제 | 사용자 경고 |
| `SCN-013` | 주의 | 출처 불명 앱 설치 요구, 원격 제어 없음 | 앱 설치 25 | CAUTION 25 강제 | 사용자 경고 |
| `SCN-014` | 주의 | 가족 사칭 안부 문자, 송금 요구 없음 | 가족 사칭 15 | CAUTION 15 강제 | 확인 요청 가능 |
| `SCN-015` | 주의 | 단축 URL + 긴급 표현 | URL 10 + 압박 15 | CAUTION 25 강제 | 사용자 경고 |
| `SCN-016` | 고위험 | KISA fixture 악성 URL 단독 | 악성 URL 35 | HIGH 35 강제 | 기본 요청, 꼼꼼 자동 |
| `SCN-017` | 고위험 | 인증번호 전달 요구 | 비밀정보 25 | HIGH 25 강제 | 기본 요청, 꼼꼼 자동 |
| `SCN-018` | 고위험 | 의심 domain + 결제 요구 + 긴급성 | 20+25+15 | HIGH 60 | 강한 경고 |
| `SCN-019` | 고위험 | 앱 설치 + 긴급성 + 의심 domain | 25+15+20 | HIGH 60 | 강한 경고 |
| `SCN-020` | 고위험 | 신고 번호 + 의심 domain + 긴급성 + 문자 연관 | 15+20+15+10 | HIGH 60 | 강한 경고 |
| `SCN-021` | 고위험 | 대출 요구 + 단축 URL + 긴급성 + 문자 연관 | 25+10+15+10 | HIGH 60 | 강한 경고 |
| `SCN-022` | 고위험 | 비밀번호 요구, Safe Browsing timeout | 비밀정보 25 | HIGH/PARTIAL | 확인 실패 명시 |
| `SCN-023` | 고위험 | 악성 URL + 번호 평판 + 연관 전화 | 35+15+10 | HIGH 60 | 강한 경고 |
| `SCN-024` | 치명 | 건강보험 사칭 + 미납금 송금 요구 | 행동25+사칭15 | CRITICAL 강제 | 자동 웹 푸시, S0 |
| `SCN-025` | 치명 | 검찰 사칭 전화 + 송금 요구 | 행동25+사칭15+전화15 | CRITICAL 강제 | 자동 웹 푸시, S0 |
| `SCN-026` | 치명 | 앱 설치 + 원격 제어 요구 | 행동 25 + 원격 제어 강제 조건 | CRITICAL 강제 | 자동 웹 푸시, S0 |
| `SCN-027` | 치명 | 자녀 사칭 + 긴급 송금 요구 | 행동25+사칭15 | CRITICAL 강제 | 자동 웹 푸시, S0 |
| `SCN-028` | 피해 | 사용자가 이미 송금했다고 응답 | 사용자 확인 | CRITICAL 강제 | 자동 알림, S4 |
| `SCN-029` | 치명 | 카드 배송 사칭 + 악성 URL + 결제 요구 | URL35+행동25+사칭15 | CRITICAL 강제 | 자동 웹 푸시, S0 |
| `SCN-030` | 장애 | 기관 사칭+송금 요구, 외부 API와 FCM 실패 | 로컬 강제 규칙 | CRITICAL/PARTIAL | 사건 유지, 알림 FAILED |

## 3. 공개 데모 6개

| 데모 | 시나리오 | 보여줄 가치 |
|---|---|---|
| `DEMO-01` 정상 택배 | `SCN-001` | 정상 메시지를 과도하게 경고하지 않음 |
| `DEMO-02` 건강보험 사칭 | `SCN-024` | 기관 사칭+송금 강제 규칙 |
| `DEMO-03` 카드 배송 | `SCN-029` | URL 평판·행동 신호·근거 설명 |
| `DEMO-04` 검찰 사칭 전화 | `SCN-025` | 문자–전화 연관·통화 후 설문 |
| `DEMO-05` 정상 병원 전화 | `SCN-003` | 정상 번호 오탐 억제 |
| `DEMO-06` 피해 발생 | `SCN-028` | S4 대응 체크리스트와 공동대응 |

데모는 `externalFixtures`의 KISA·Safe Browsing·FCM 응답을 고정하고 실제 외부 서비스를 호출하지 않습니다.

## 4. 경계값 fixture

시나리오 30건과 별도로 자동 생성합니다.

| ID | 점수 | 예상 |
|---|---:|---|
| `BOUNDARY-029` | 29 | SAFE |
| `BOUNDARY-030` | 30 | CAUTION |
| `BOUNDARY-059` | 59 | CAUTION |
| `BOUNDARY-060` | 60 | HIGH |
| `BOUNDARY-079` | 79 | HIGH |
| `BOUNDARY-080` | 80 | CRITICAL |
| `BOUNDARY-100` | 100 | CRITICAL |

강제 규칙 fixture는 실제 점수와 강제 후 수준을 둘 다 assert합니다.

## 5. 변형 규칙

각 위험 family에서 다음 변형을 생성하되 같은 family끼리 train/test에 나누지 않습니다.

- 띄어쓰기·줄바꿈
- 한글·영문 혼합
- 숫자·유사 문자
- 문장 순서 변경
- URL 대소문자·인코딩
- 단축 URL 표기
- 알림 본문 잘림
- 여러 URL 중 하나만 위험

## 6. 시나리오 승인 기준

- 입력이 자연스러운 한국어인지 기획 담당자가 검토
- 예상 수준·근거를 개발 담당자가 `risk-spec.md`와 대조
- 실제 개인·활성 URL·계좌정보가 없는지 확인
- 정상 사례가 위험 사례와 충분히 유사해 오탐을 검증하는지 확인
- demo fixture에는 화면 문구와 각 step의 예상 상태 포함
- 정책 버전 변경 시 기존 30건 결과 diff 승인

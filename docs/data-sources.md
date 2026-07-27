# 돈워리 데이터 출처·라이선스

> 상태: 연동 검증 전 초안
>
> 최종 확인일: 2026-07-27
>
> 관련 문서: [위험 판정](risk-spec.md) · [테스트·평가](test-evaluation-plan.md) · [기획서](기획서.md)

## 1. 원칙

- 무료 접근 가능 여부와 재배포·가공 가능 여부를 구분합니다.
- 출처 URL, 다운로드 시각, 파일 checksum과 변환 명령을 기록합니다.
- 사용자 신고를 자동 학습하지 않습니다.
- 원문 사례에 개인정보가 있으면 제거하거나 합성 특징으로 변환합니다.
- 라이선스가 불명확한 데이터는 production 판정과 제출 데이터셋에 넣지 않습니다.

## 2. MVP 출처

| ID | 출처 | 용도 | MVP 상태 | 확인할 조건 |
|---|---|---|---|---|
| `KISA_PHISHING_URL` | [공공데이터포털 KISA 피싱사이트 URL](https://www.data.go.kr/data/15109780/fileData.do) | 악성 URL snapshot | 연동 후보 | 이용허락 범위, 갱신주기, 컬럼, 재배포 |
| `GOOGLE_SAFE_BROWSING` | [Safe Browsing](https://developers.google.com/safe-browsing) | 신규 URL 평판 | 대회 비상업 데모 후보 | 비상업 용도, 표시·경고 가이드, quota, URL 보존·cache |
| `GOOGLE_WEB_RISK` | [Web Risk 가격](https://cloud.google.com/web-risk/pricing) | 상용화·약관 불확실 시 대체 | P1 후보 | billing, 월 무료 호출, URL 보존·cache 조건 |
| `OFFICIAL_DOMAINS` | 공공기관·금융기관 공식 사이트 | 사칭 도메인 비교 | 자체 curated | 기관별 공식 출처, 검토일 |
| `PUBLIC_CASES` | 경찰·금감원·KISA 공개 안내·보도자료 | 유형·표현 사전 | 콘텐츠 참고 | 인용·가공 조건, 개인정보 제거 |
| `SYNTHETIC_SCENARIOS` | 팀 작성 합성 시나리오 | 테스트·데모·평가 | 채택 | 실제 개인정보·활성 악성 링크 금지 |
| `USER_FEEDBACK` | 대상자·보호자 피드백 | 오류 분석 | P1 | 별도 동의, 검수, 비식별화 |

Safe Browsing은 공식 안내상 비상업 용도에 한정됩니다. 대회 운영이 허용 범위인지 제출 전에 다시 확인하며 불명확하면 KISA snapshot·도메인 규칙·합성 fixture만 사용하거나 Web Risk로 교체합니다.

direct lookup은 userinfo·fragment를 제거하고 SSRF 검사를 통과한 canonical URL을 사용합니다. query가 판정에 필요하면 공급자에게 전송될 수 있으므로 개인정보 안내와 source manifest에 `external_fields`, `provider_retention`, `cache_policy`, `approved_at`, `reviewer`를 기록합니다. 이 항목이 승인되지 않은 source는 production에서 비활성화합니다.

## 3. 저장 구조

```text
tools/data/
├── sources.yaml
├── raw/                  # gitignore, 원본
├── normalized/           # 정규화 결과
├── fixtures/             # 검수된 합성·비식별 데이터
├── prepare_kisa.py
├── build_official_domains.ts
└── README.md
```

운영 이미지에는 `raw/`와 Python 환경을 포함하지 않습니다.

## 4. Source manifest

`sources.yaml` 최소 필드:

```yaml
id: KISA_PHISHING_URL
provider: Korea Internet & Security Agency
source_url: https://www.data.go.kr/data/15109780/fileData.do
retrieved_at: 2026-07-27T00:00:00Z
license_name: TO_BE_VERIFIED
license_url: null
checksum_sha256: TO_BE_FILLED
record_count: TO_BE_FILLED
schema_version: 1
transform_command: pnpm data:prepare:kisa
reviewer: TO_BE_FILLED
external_fields: [canonical_url]
provider_retention: TO_BE_VERIFIED
cache_policy: TO_BE_VERIFIED
approved_at: null
```

`TO_BE_VERIFIED` 상태의 source는 production seed와 제출 평가에 포함하지 않습니다.

## 5. KISA 처리

```text
download
  → checksum
  → schema validation
  → URL canonicalization
  → exact duplicate removal
  → active URL 접속 금지
  → domain/hash snapshot
  → signed version manifest
```

- 개발자가 데이터의 악성 URL을 브라우저로 직접 열지 않습니다.
- redirect를 따라가며 수집하지 않습니다.
- 원본 URL은 격리된 raw 저장소에 두고 앱 bundle에는 포함하지 않습니다.
- Android에는 검수된 최소 공식 번호·규칙만 전달합니다.
- KISA snapshot은 서버에서 마지막 정상 버전을 유지합니다.

## 6. 공식 도메인 목록

각 항목은 다음을 기록합니다.

| 필드 | 설명 |
|---|---|
| `entityId` | 내부 기관 ID |
| `displayName` | 사용자 표시명 |
| `officialDomains` | 정확히 검증한 domain |
| `officialPhoneMasked` | 화면 표시용 번호 |
| `sourceUrl` | 기관 공식 페이지 |
| `verifiedAt` | 마지막 수동 확인 |
| `reviewer` | 확인자 |

검색 결과나 제3자 블로그만으로 공식 domain·번호를 등록하지 않습니다.

## 7. 합성 데이터 규칙

- 실존 개인 이름·전화번호·계좌번호를 사용하지 않습니다.
- URL은 `.invalid`, `.test`, `.example` 예약 domain 또는 명시적 mock을 사용합니다.
- 악성 표현을 다양화하되 실제 범죄 실행 지침을 만들지 않습니다.
- 정상 사례에는 위험 사례와 유사한 어휘를 포함해 오탐을 검증합니다.
- LLM이 생성한 문장은 사람이 위험 수준과 근거를 검수한 뒤 fixture로 승격합니다.
- 데모 fixture는 외부 API 응답도 함께 고정합니다.

## 8. 데이터 분리

| 집합 | 목적 | 변경 |
|---|---|---|
| authoring | 규칙 작성·threshold 조정 | 수시 |
| validation | 후보 정책 비교 | release 전 동결 |
| test | 최종 지표 | 결과 확인 전 동결 |
| demo | 6개 설명용 흐름 | 사람이 검수 |

같은 문장을 약간 바꾼 항목이 서로 다른 집합에 들어가지 않도록 scenario family 단위로 분리합니다.

## 9. 갱신 실패

| 실패 | 처리 |
|---|---|
| 다운로드 실패 | 마지막 정상 snapshot 유지 |
| schema 변경 | 새 버전 활성화 중단, alert 발생 |
| checksum 불일치 | 폐기 |
| 빈 데이터·급격한 건수 변화 | 수동 승인 전 미활성 |
| 라이선스 변경 | production 사용 중단 검토 |
| Safe Browsing timeout | `FINALIZED_PARTIAL` |

## 10. 데이터 카드 완료 조건

- 출처·제공기관·접근 URL
- 이용 조건·라이선스 링크
- 다운로드·검토일
- 원본·정규화 checksum
- record 수와 제외 수
- 개인정보 제거 방법
- train/validation/test 분리 방법
- 알려진 편향과 누락
- 제품 판정에서 사용하는 방식
- 다음 갱신일과 담당자

# 돈워리 문서 인덱스

> 최종 갱신: 2026-07-28
>
> 대상: 풀스택 개발자, 기획·디자인 담당자, 제출 검토자

## 1. 문서 원칙

- 문서마다 하나의 질문에 답하고, 같은 계약을 여러 곳에서 복사하지 않습니다.
- 미구현 기능은 계획과 구현 완료를 구분합니다.
- 코드가 생긴 뒤 요청·응답 schema는 생성된 OpenAPI, 데이터 schema는 Prisma migration이 최종 기준입니다.
- 사용자에게 보이는 위험 수준과 알림 정책은 `risk-spec.md`와 `alert-policy.md`를 동시에 만족해야 합니다.
- 개인정보 처리 변경은 기능 구현과 함께 `privacy-security.md`를 갱신합니다.

## 2. 기준 우선순위

충돌이 생기면 아래 순서로 해석합니다.

1. 개인정보·동의: [privacy-security.md](privacy-security.md)
2. 위험 판정: [risk-spec.md](risk-spec.md)
3. API·인가·데이터: [backend-spec.md](backend-spec.md), 생성 OpenAPI, Prisma migration
4. 배포·실행 구조: [infrastructure-architecture.md](infrastructure-architecture.md)
5. 기술 선택: [development-stack.md](development-stack.md)
6. 제품 범위·가치: [PRD.md](../PRD.md)
7. 일정: [SCHEDULE.md](../SCHEDULE.md)

기준 문서의 결정을 바꾸면 관련 문서를 같은 PR에서 함께 수정합니다.

## 3. 문서 목록

### 제품·사용자

| 문서 | 답하는 질문 | 상태 | 주 담당 |
|---|---|---|---|
| [PRD](../PRD.md) | 누구의 어떤 문제를 어떤 범위로 해결하는가? | 기준안 | 공동 |
| [기획서](기획서.md) | 대회 심사자에게 무엇을 제안하는가? | 작성 중 | 기획 |
| [사용자 조사](user-research.md) | 보호 대상자·보호자는 어떤 맥락에서 사용하는가? | 초안 완료 | 기획 |
| [화면 IA](ia.md) | 어떤 화면과 상태가 필요한가? | 초안 | 기획 |
| [UX·콘텐츠 가이드](ux-content-guide.md) | 어떤 문구·접근성·행동 원칙을 사용하는가? | 초안 | 기획 |

### 판정·데이터·보안

| 문서 | 답하는 질문 | 상태 | 주 담당 |
|---|---|---|---|
| [위험 판정 사양](risk-spec.md) | 같은 입력이 어떤 위험 수준과 근거를 만드는가? | RiskEngine v1.1 구현·데이터 보정 대기 | 개발 |
| [알림 정책](alert-policy.md) | 위험 수준별로 누구에게 무엇을 표시하는가? | 구현 기준 | 공동 |
| [시나리오](scenarios.md) | 정상·위험·장애 입력의 예상 결과는 무엇인가? | 초기 30건 | 공동 |
| [데이터 출처](data-sources.md) | 어떤 데이터를 어떤 조건으로 수집·갱신하는가? | 검증 중 | 공동 |
| [개인정보·보안](privacy-security.md) | 무엇을 수집·공유·보존·삭제하는가? | 구현 기준 초안 | 공동 |

### 기술·구현

| 문서 | 답하는 질문 | 상태 | 주 담당 |
|---|---|---|---|
| [인프라 아키텍처](infrastructure-architecture.md) | 시스템이 어디서 실행되고 어떻게 실패하는가? | 구현 기준 | 개발 |
| [개발 스택](development-stack.md) | 어떤 언어·프레임워크·도구를 쓰는가? | 구현 기준 | 개발 |
| [백엔드 사양](backend-spec.md) | 인증·API·데이터·상태 계약은 무엇인가? | 구현 추적 중 | 개발 |
| [Android 스파이크](android-spike.md) | 목표 기기에서 자동 감지 기능이 실제 작동하는가? | 에뮬레이터 검증 완료·Samsung 대기 | 개발 |
| [테스트·평가 계획](test-evaluation-plan.md) | 무엇을 어떤 데이터와 지표로 검증하는가? | 초안 | 공동 |
| [결정 기록](decisions.md) | 중요한 선택을 언제 왜 바꿨는가? | 운영 중 | 개발 |

### 제출·운영

| 문서 | 답하는 질문 | 상태 | 주 담당 |
|---|---|---|---|
| [기능명세서](기능명세서.md) | 제출 시 실제 동작하는 기능은 무엇인가? | 구현 추적 중 | 공동 |
| [데모 가이드](demo-guide.md) | 심사자가 어떤 순서로 무엇을 확인하는가? | 로컬 검증 완료·배포 정보 대기 | 공동 |
| [Render 배포 가이드](deployment-render.md) | 승인 후 어떤 값과 순서로 배포하는가? | 로컬 검증 완료·계정 승인 대기 | 개발 |
| [운영 런북](operations-runbook.md) | 어떻게 배포·복구·모니터링하는가? | 공급자 반영·실배포 대기 | 개발 |
| [릴리스 체크리스트](release-checklist.md) | 제출 전 무엇이 모두 확인되어야 하는가? | 골격 | 공동 |

## 4. 갱신 규칙

| 변경 | 함께 갱신할 문서 |
|---|---|
| 위험 점수·강제 규칙 | `risk-spec.md`, `scenarios.md`, 정책 bundle version |
| 알림 임계값·공유 수준 | `alert-policy.md`, `privacy-security.md`, `backend-spec.md` |
| endpoint·DTO | NestJS DTO/OpenAPI, `backend-spec.md`의 endpoint matrix |
| Prisma model·보존기간 | migration, `backend-spec.md`, `privacy-security.md` |
| 원문 분석·공유 방식 | `privacy-security.md`, `backend-spec.md`, `ia.md` |
| P0/P1 범위 | `PRD.md`, `SCHEDULE.md`, `기능명세서.md` |
| Android 지원 범위 | `android-spike.md`, `기능명세서.md`, `demo-guide.md` |
| 데이터 제공 조건 | `data-sources.md`, `risk-spec.md`, 기획서 5번 |
| 배포 공급자·환경 | `operations-runbook.md`, `infrastructure-architecture.md` |

## 5. 완료 표시

- `초안`: 구조와 기본 결정이 있으나 검증 전
- `구현 기준`: 개발을 시작할 수 있는 계약
- `검증 완료`: 테스트 결과와 근거가 연결됨
- `제출 확정`: 실제 배포 상태만 반영하고 미구현 항목을 제거함

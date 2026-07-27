# 돈워리 MVP 릴리스 체크리스트

> 상태: 실행 전
>
> 관련 문서: [기능명세서](기능명세서.md) · [운영 런북](operations-runbook.md) · [데모 가이드](demo-guide.md)

## 1. Scope freeze

- [ ] P0 기능 목록 확정
- [ ] P1·P2 기능이 release branch와 기능명세서에서 제외됨
- [ ] Android 스파이크 결과로 자동 감지 지원 범위 확정
- [ ] 미구현 기능을 `기능명세서.md`에서 제거
- [ ] 알려진 제한사항을 데모·명세서에 기록

## 2. 계약

- [ ] `risk-spec.md` 정책 버전 고정
- [ ] golden fixture 30건+경계값 통과
- [ ] OpenAPI 생성·breaking diff 확인
- [ ] Android·웹 generated client compile
- [ ] Prisma migration history 검토
- [ ] 동의·공유·보존·삭제 계약 확인

## 3. 기능 검증

- [ ] 핵심 E2E 6개 반복 성공
- [ ] 대상자 25명 정렬
- [ ] P0 대상자당 활성 보호자 1명 제한
- [ ] 알림 본문 누락 fallback
- [ ] 네트워크 없음→재전송
- [ ] Safe Browsing·LLM timeout fallback
- [ ] FCM retry·중복 제거
- [ ] S0~S4 체크리스트
- [ ] 데모 6개 완주

## 4. Android

- [ ] Samsung 주 데모 기기 확인
- [ ] 최소 Android 10 확인
- [ ] 최신 Android 알림 제한 확인
- [ ] Notification Listener 권한·거부·본문 누락
- [ ] CallScreening role·deadline
- [ ] 고우선순위 알림·Warning Activity
- [ ] WorkManager offline retry
- [ ] TalkBack·큰 글씨·회전/재시작
- [ ] release signing APK
- [ ] APK SHA-256 생성

## 5. Web

- [ ] 공개 `/demo` 로그인 없이 접근
- [ ] 데모 route가 운영 API·DB·FCM을 호출하지 않음
- [ ] 보호자 login·session 복구
- [ ] dashboard mobile·desktop
- [ ] service worker·push 권한 거부
- [ ] keyboard·focus·screen reader
- [ ] error·empty·offline·partial state
- [ ] Chrome desktop/mobile 실제 확인

## 6. API·DB

- [ ] `/health/live`, `/health/ready`
- [ ] Firebase token 검증·인가
- [ ] activation code 만료·1회·rate limit
- [ ] idempotency unique
- [ ] outbox at-least-once·dedupe
- [ ] production migration dry-run
- [ ] DB backup/restore point
- [ ] N+1·25명 dashboard query 확인
- [ ] 로그 redaction

## 7. 개인정보·보안

- [ ] 권한과 제품 동의 분리
- [ ] 동의 철회 race test
- [ ] MINIMAL/BASIC snapshot
- [ ] 탈퇴·기기 해제·push revoke
- [ ] URL SSRF 방어
- [ ] secret scan
- [ ] APK·웹 bundle에 서버 API key 없음
- [ ] Sentry request body·Authorization 비활성
- [ ] data source 라이선스·checksum 기록

## 8. 배포

- [ ] staging과 production secret 분리
- [ ] Firebase project 분리
- [ ] production Web/API/DB 공급자·리전 기록
- [ ] 이전 web/API version rollback 가능
- [ ] risk policy·KISA last-known-good
- [ ] uptime·5xx·outbox alert
- [ ] 운영 기간 담당·확인 시간 합의
- [ ] 운영 종료·키 회전 계획

## 9. 제출물

- [ ] 기획서 HWP/PDF 최종본
- [ ] 기능명세서 HWP/PDF 최종본
- [ ] 공개 URL
- [ ] 보호자 테스트 계정
- [ ] APK URL·checksum
- [ ] 실제 release commit
- [ ] 평가 결과·dataset·policy version
- [ ] 3분 데모와 15분 발표
- [ ] release commit 기반 대체 영상
- [ ] 스크린샷·문서 artifact 백업

## 10. 새 환경 재현

기존 로그인·cache가 없는 새 환경에서 수행합니다.

- [ ] 브라우저 새 프로필로 공개 데모
- [ ] 보호자 테스트 계정 로그인
- [ ] 새 Android 설치 후 활성화
- [ ] fixture 입력과 예상 결과
- [ ] 제한사항·권장 브라우저 확인
- [ ] 문서 링크와 다운로드 권한 확인

## 11. Go/No-Go

아래 중 하나라도 해당하면 No-Go입니다.

- 공개 URL 접근 불가
- 데모 6개 중 하나라도 완주 불가
- 개인정보·secret 노출
- production migration 미검증
- CRITICAL 사건이 저장되지 않음
- 동의 철회 후 보호자 접근 가능
- APK 설치·서명·checksum 불일치
- 기능명세서가 미구현 기능을 구현으로 표시

최종 승인:

| 역할 | 이름 | 시각 | 결과 |
|---|---|---|---|
| 개발 | `TO_BE_FILLED` | `TO_BE_FILLED` | GO/NO-GO |
| 기획·디자인 | `TO_BE_FILLED` | `TO_BE_FILLED` | GO/NO-GO |

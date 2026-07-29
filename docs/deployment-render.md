# Render 배포 가이드

> 상태: Blueprint·컨테이너 로컬 검증 완료, 계정 연결·과금 승인 대기
>
> 기준 파일: [`render.yaml`](../render.yaml) · [`Dockerfile`](../Dockerfile)

## 1. 채택 구성

한 명의 개발자가 대회 운영 기간을 관리할 수 있도록 Web, API, PostgreSQL을 Render
Singapore 한 공급자에 둡니다.

| Resource | Blueprint 이름 | Plan | 공개 경로 |
|---|---|---|---|
| Next.js Web | `dont-worry-ai-challenge-web` | Starter | `/demo`, 보호자 웹 |
| NestJS API | `dont-worry-ai-challenge-api` | Starter | `/health/*`, `/v1/*` |
| PostgreSQL 17 | `dont-worry-ai-challenge-db` | Basic 256 MB·15 GB | public access 차단 |

Starter 서비스를 쓰는 이유는 무료 서비스의 sleep/cold start가 제출 URL의 가용성 조건과
맞지 않기 때문입니다. PostgreSQL은 PITR과 논리 backup이 없는 Free plan을 사용하지
않습니다. 계정 연결 화면에서 표시되는 현재 월 예상액을 팀이 승인한 뒤에만 생성합니다.

## 2. 배포 전 준비

1. Firebase staging 또는 production project와 Web App을 만듭니다.
2. Firebase Admin service account의 `project_id`, `client_email`, `private_key`를
   준비합니다.
3. 다음 두 서비스 이름의 `onrender.com` 주소를 사용할 수 있는지 확인합니다.
4. API origin은 `https://dont-worry-ai-challenge-api.onrender.com`, Web origin은
   `https://dont-worry-ai-challenge-web.onrender.com`을 기본 후보로 사용합니다.
5. 이름 충돌로 실제 hostname이 달라지면 Blueprint 생성 전에 서비스 이름과 아래 URL
   입력값을 함께 바꿉니다.

## 3. Blueprint 입력값

`sync: false` 값은 최초 Blueprint 생성 화면에서만 입력 요청됩니다. 저장소나 채팅에 실제
값을 복사하지 않습니다.

### API

| Key | 값·출처 |
|---|---|
| `WEB_ORIGIN` | 실제 Web HTTPS origin, path와 trailing slash 없음 |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin service-account email |
| `FIREBASE_PRIVATE_KEY` | PEM private key 전체. `\n` 문자열과 실제 줄바꿈 모두 지원 |

보안용 세 secret과 `DATABASE_URL`은 Blueprint가 각각 자동 생성하거나 DB에서 참조합니다.
`LLM_PROVIDER=template`이 기본이므로 OpenAI key는 넣지 않습니다. 실제 모델 평가와 별도
승인이 끝난 뒤에만 API 서비스에 `OPENAI_API_KEY`,
`OPENAI_EXPLANATION_MODEL`, `LLM_PROVIDER=openai`를 추가합니다.

### Web

| Key | 값·출처 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 실제 API HTTPS origin |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web App config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Web App config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Web App config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web App config |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Firebase Cloud Messaging Web Push key |

`NEXT_PUBLIC_*` 값은 Web image에 포함되는 공개 client 설정입니다. Firebase Security
Rules와 API token 검증이 권한 경계이며, Admin credential은 절대 Web 설정에 넣지
않습니다.

### Sentry 선택 설정

Sentry 계정과 데이터 수집정책 승인 후에만 추가합니다. DSN이 없으면 SDK는 비활성입니다.

| Service | Key |
|---|---|
| API | `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `SENTRY_RELEASE` |
| Web server | `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `SENTRY_RELEASE` |
| Web browser | `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`, `NEXT_PUBLIC_SENTRY_RELEASE` |

Web browser용 값은 build argument로 포함되므로 값을 추가한 뒤 반드시 재배포합니다.
source-map upload는 별도 auth token 승인이 필요해 현재 비활성입니다. event scrubber는
request body·header·cookie·query·user·breadcrumb·원래 오류 메시지를 전송 전에 제거하고
tracing과 기본 PII 수집을 끕니다.

## 4. 최초 배포

1. Render Dashboard에서 **New → Blueprint**를 선택하고 저장소를 연결합니다.
2. `render.yaml`을 선택하고 세 유료 resource 및 예상 비용을 확인합니다.
3. 3절의 값을 입력하고 Blueprint를 생성합니다.
4. API pre-deploy 단계에서 `prisma migrate deploy`가 성공했는지 확인합니다.
5. API readiness가 통과한 뒤 Web이 배포되는지 확인합니다.
6. 실제 URL과 resource ID를 `operations-runbook.md`에 기록합니다.

Render는 Docker 환경변수를 build argument로도 전달합니다. Dockerfile은 `APP_TARGET`만
image 선택에 사용하며 private key 같은 secret build argument를 참조하거나 image에
복사하지 않습니다.

## 5. 배포 검증

```bash
curl -fsS https://API_HOST/health/live
curl -fsS https://API_HOST/health/ready
curl -fsSI https://WEB_HOST/demo
```

다음도 수동으로 확인합니다.

- `/demo` 비로그인 6개 시나리오와 모바일 viewport
- Firebase 테스트 보호자 로그인
- 합성 CRITICAL 사건 → outbox → FCM → 보호자 대시보드
- Web 응답의 CSP `frame-ancestors 'none'`와 `X-Frame-Options: DENY`
- API/Web 로그에 Authorization, 원문, 전체 전화번호, URL query가 없는지
- Render Postgres Recovery 화면에서 PITR 사용 가능 여부

검증이 끝나기 전에는 기능명세서에 공개 URL이나 실제 FCM을 `VERIFIED`로 표시하지
않습니다.

## 6. 자동 배포와 migration

두 서비스 모두 `autoDeployTrigger: checksPass`입니다. main push 후 GitHub Actions가
통과해야 배포가 시작됩니다. API는 새 image 실행 전에 다음 명령을 실행합니다.

```bash
node node_modules/prisma/build/index.js migrate deploy
```

migration 실패 시 새 API release를 중단합니다. 이미 production에 적용된 migration
파일은 수정하지 않고 forward-only migration을 추가합니다.

## 7. Backup과 rollback

- Hobby workspace의 paid PostgreSQL PITR window는 최근 3일입니다.
- 논리 backup export는 생성 후 7일 보관되므로 주요 release 전 별도 export를 만듭니다.
- MVP 목표는 RPO 1시간, RTO 2시간이며 최초 staging restore drill로 달성 여부를
  측정합니다.
- Web/API rollback은 Render의 이전 성공 deploy를 재배포합니다.
- DB 장애는 원 DB를 덮어쓰지 않고 PITR로 새 instance를 만든 뒤 검증하고
  `DATABASE_URL`을 전환합니다.
- 로컬 복구 절차 자체는 `pnpm db:restore:verify`로 검증합니다.

## 8. 외부 변경 승인 경계

다음은 저장소 작업과 달리 비용 또는 외부 상태를 변경하므로 팀 승인 후 실행합니다.

- Render workspace·Blueprint 생성 및 유료 plan 결제
- custom domain 연결
- production Firebase project와 service account 생성
- OpenAI provider 활성화
- production 데이터 restore, resource 삭제, secret 회전

## 9. 공식 근거

- [Render Blueprint YAML](https://render.com/docs/blueprint-spec)
- [Render Docker 배포](https://render.com/docs/docker)
- [Render region](https://render.com/docs/regions)
- [Render PostgreSQL backup·PITR](https://render.com/docs/postgresql-backups)

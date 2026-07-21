# 배포 및 설치

<a id="requirements"></a>
## 요구 사항

- Node.js `>=20.11.0` 및 npm
- PostgreSQL 16+ 또는 Docker Compose
- 유효한 `OPINET_API_KEY`
- Vercel 배포에는 외부에서 접근 가능한 PostgreSQL `DATABASE_URL`

<a id="quick-start"></a>
## 빠른 시작

로컬 PostgreSQL을 먼저 실행한 뒤 다음 순서로 진행합니다.

1. 의존성을 설치합니다.

   ```bash
   npm install
   ```

2. `.env.example`을 `.env.local`로 복사합니다. Docker Compose도 사용할 경우 `.env`도 별도로 만듭니다.
3. `DATABASE_URL`과 `OPINET_API_KEY`를 채우고, 관리자 인증을 사용할 경우 `ADMIN_PASSWORD_HASH`와 `ADMIN_SESSION_SECRET`도 설정합니다.
4. migration을 적용하고, 외부 지표 동기화와 Opinet ingest를 실행한 뒤 개발 서버를 시작합니다.

   ```bash
   npx prisma migrate deploy
   npm run sync:indicators
   npm run ingest:opinet
   npm run dev
   ```

5. 대시보드는 `http://localhost:3000`에서 확인합니다.

`npm run ingest:opinet`과 `npm run sync:indicators`의 반복 실행 및 결과 판정은 [운영 문서](operations.md)를 따릅니다.

<a id="environment-variables"></a>
## 환경 변수

`.env.example`의 변수와 현재 런타임 계약은 다음과 같습니다. 비밀값과 실제 접속 문자열은 저장소, 코드, GitHub에 기록하지 않습니다.

| 변수 | 용도 및 값/규칙 |
|---|---|
| `DATABASE_URL` | 필수 PostgreSQL 연결 문자열. 예시는 `postgresql://postgres:postgres@localhost:5432/opinet_diesel_dashboard?schema=public`입니다. |
| `RUNTIME_FAMILY` | `container-web-postgres-cron`으로 고정됩니다. |
| `RUNTIME_ROLE` | `app` 또는 `worker`; 기본값은 `app`입니다. |
| `OPINET_DATASET_KEY` | `national-average-opinet-diesel`로 고정됩니다. |
| `QUEUE_DOMAIN` | `national-average-opinet-diesel`로 고정됩니다. |
| `APP_RUNTIME_ID` | 앱 런타임 식별자이며 기본값은 `web-app`입니다. |
| `WORKER_RUNTIME_ID` | worker 런타임 식별자이며 기본값은 `scheduled-worker`입니다. |
| `SCHEDULED_JOB_NAME` | 스케줄 작업명이며 기본값은 `scheduled-national-average-ingest`입니다. |
| `OPINET_API_KEY` | 필수 Opinet API 키입니다. |
| `OPINET_AVG_PRICE_URL` | `https://www.opinet.co.kr/api/avgAllPrice.do?out=json` |
| `OPINET_RECENT_PRICE_URL` | `https://www.opinet.co.kr/api/avgRecentPrice.do?out=json` |
| `OPINET_STATS_PRICE_URL` | `https://www.opinet.co.kr/user/dopospdrg/dopOsPdrgSelect.do` |
| `POSTGRES_DB` | Compose PostgreSQL DB명; 기본값은 `opinet_diesel_dashboard`입니다. |
| `POSTGRES_USER` | Compose PostgreSQL 사용자; 기본값은 `postgres`입니다. |
| `POSTGRES_PASSWORD` | Compose PostgreSQL 비밀번호; 기본값은 `postgres`입니다. |
| `ADMIN_PASSWORD_HASH` | 관리자 비밀번호 해시입니다. |
| `ADMIN_SESSION_SECRET` | 최소 32바이트의 무작위 문자열입니다. |
| `ADMIN_SESSION_MAX_AGE_DAYS` | 양의 정수 세션 만료일이며 기본값은 `14`입니다. |

Vercel에는 최소 `Production` 환경을 포함해 `DATABASE_URL`, `OPINET_API_KEY`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`를 등록합니다. `ADMIN_SESSION_MAX_AGE_DAYS=14`는 기본값을 사용할 수 있습니다. 현재 코드가 사용하는 `OPINET_AVG_PRICE_URL`, `OPINET_RECENT_PRICE_URL`, `OPINET_STATS_PRICE_URL`, `RUNTIME_FAMILY`, `RUNTIME_ROLE`, `OPINET_DATASET_KEY`, `QUEUE_DOMAIN`, `APP_RUNTIME_ID`, `WORKER_RUNTIME_ID`, `SCHEDULED_JOB_NAME`도 해당 환경에 유지합니다. 저장 후 새 배포를 실행합니다.

<a id="node-environment"></a>
## NODE_ENV

`.env.local`과 `.env`에 `NODE_ENV`를 직접 넣지 않습니다. `npm run build`와 `npm run start`는 내부에서 `NODE_ENV=production`을 강제하며, Compose의 `app`과 `worker`도 `NODE_ENV: production`을 설정합니다.

<a id="local-production-and-compose"></a>
## 로컬 production 및 Docker Compose

로컬 production 실행은 다음 명령을 사용합니다.

```bash
npm run build
npm run start
```

Docker Compose는 PostgreSQL, Next.js 앱, one-shot worker 서비스를 제공합니다.

```bash
docker compose up --build
```

Compose의 `app`과 `worker`는 PostgreSQL healthcheck 이후 `npx prisma migrate deploy`를 실행합니다. `app`은 `npm run start -- --hostname 0.0.0.0 --port 3000`을 실행하고, `worker`는 `npm run worker`를 한 번 실행합니다. 반복 worker 호출은 [운영 문서](operations.md#external-schedulers)의 외부 스케줄러가 담당합니다.

<a id="migrations"></a>
## Prisma migration

현재 migration은 다음 여섯 개입니다.

- `20260706_init`
- `20260710075455_add_quarter_settings`
- `20260710081716_add_fsc_models`
- `20260715123000_add_reliability_sample_counts`
- `20260716093000_add_indicator_collected_at`
- `20260720092000_add_indicator_sync_state`

로컬 DB 점검 및 적용 순서입니다.

```bash
npx prisma validate
npx prisma generate
npx prisma migrate deploy
```

Production/Vercel DB 반영은 먼저 migration을 적용하고 이어서 배포용 build를 실행합니다.

```bash
npx prisma migrate deploy
npm run vercel-build
```

`20260710081716_add_fsc_models` migration은 기존 `fsc_results.metadata` 컬럼을 제거하고 기본값 없는 필수 컬럼을 추가합니다. Production에 기존 `fsc_results` 행이 있으면 migration이 실패할 수 있으므로 적용 전에 행 존재 여부와 schema 호환성을 점검합니다. 행이 있으면 승인된 백업과 backfill 또는 staged migration 계획을 먼저 준비하며, 데이터 삭제나 truncate를 우회책으로 사용하지 않습니다.

<a id="vercel-deployment"></a>
## Vercel 배포

배포용 build는 Prisma Client 생성을 포함합니다.

```bash
npm run vercel-build
```

환경 변수를 등록한 뒤 Production DB에 migration을 적용하고 위 build 순서로 배포합니다. Vercel 프로젝트는 `fsc-forecast`입니다.

<a id="deployment-addresses"></a>
## 배포 주소

기존 README에 기재된 Production 주소는 `https://fsc-forecast.vercel.app`입니다. 로컬 대시보드 진입 주소는 [빠른 시작](#quick-start)의 `http://localhost:3000`입니다.

<a id="admin-credential-provisioning"></a>
## 관리자 credential provisioning

관리자 credential은 배포 시 한 번 준비합니다.

```bash
npm run generate:admin-password-hash
```

원문 비밀번호는 `.env.example`, GitHub, 코드에 넣지 않습니다. 명령의 출력 한 줄만 `ADMIN_PASSWORD_HASH=` 값으로 복사합니다. `ADMIN_SESSION_SECRET`에는 최소 32바이트 무작위 문자열을 넣고, 필요하면 `ADMIN_SESSION_MAX_AGE_DAYS`를 양의 정수로 설정합니다. 비밀번호 기반 인증에서는 `ADMIN_EMAILS`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`를 읽지 않으므로 필수가 아닙니다.

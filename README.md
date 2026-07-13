# FSC Forecast

전국 평균 자동차용 경유가만 다루는 MVP입니다. 오피넷 평균가격 수집, DB 기반 ingest/recompute snapshot, 주간·월간 집계, 4주·3개월 예측, 규칙 기반 해설까지 한 흐름으로 묶여 있습니다.


## 0) 프로젝트 목적과 아키텍처

이 저장소는 **전국 평균 자동차용 경유가 원천 데이터**를 유지하면서, 그 위에 **Active Quarter 기반 FSC 계산 이력**을 쌓는 구조입니다.

핵심 구성은 아래처럼 분리됩니다.
- `PriceRevisionLog` / `DailyPriceCurrent` — 오피넷 current truth 이력과 현재값
- `RecomputeSnapshot` — 특정 시점의 원천 current truth, forecast, commentary, export를 묶는 snapshot
- `ForecastRun` / `ForecastPoint` — 원천 예측 결과와 품질 gate
- `QuarterSetting` — 현재 운영 중인 분기와 기준가/적용가/비율 설정
- `FscResult` — 특정 quarter에 대한 immutable FSC 계산 결과
- `FscQuarterWeek` — 해당 `FscResult.id`에만 속하는 actual/forecast 혼합 주차 행

즉, `RecomputeSnapshot`은 원천 데이터 snapshot이고, `FscResult`는 그 snapshot을 참조해 계산한 **분기별 FSC 결과 이력**입니다. FSC 재계산은 기존 결과를 덮어쓰지 않고 새 `FscResult`와 새 `FscQuarterWeek` 묶음을 추가합니다.

## 0.1) Active Quarter와 rollover

- active quarter는 DB에서 `activeKey = "ACTIVE"` 한 건으로 유지합니다.
- `ensureActiveQuarter()`는 active quarter가 없으면 최초 `2026 Q3`을 생성합니다.
- active quarter가 종료되면 기존 quarter를 `closed`로 바꾸고 다음 quarter를 활성화합니다.
- 서버가 여러 분기 동안 실행되지 않았더라도 현재 날짜를 포함하는 quarter까지 catch-up rollover를 반복합니다.
- 분기 전환은 `Q4 -> 다음 해 Q1`, `Q1 -> 이전 해 Q4` 규칙을 따릅니다.

## 0.2) actual-first와 forecast fallback

FSC 주차 생성은 **actual-first** 원칙을 사용합니다.
- 완료된 actual 주차가 있으면 `priceKind=actual`
- 없으면 forecast 사용

forecast fallback 우선순위는 아래와 같습니다.
1. 해당 주차에 직접 대응하는 weekly forecast point
2. 해당 월에 대응하는 monthly forecast point
3. 가장 가까운 이전 forecast point carry-forward
4. `QuarterSetting.appliedPriceKrwPerL`
5. `QuarterSetting.basePriceKrwPerL`

fallback 사용 여부와 종류는 `FscQuarterWeek.forecastSourceKind`, `fallbackUsed`, 그리고 `FscResult.calculationPayload`에 기록됩니다.

## 0.3) FSC 계산식과 formula version

현재 계산식 버전은 `fsc-v1`입니다.

```text
priceDiffKrwPerL = quarterAverageKrwPerL - basePriceKrwPerL
diffRatio = priceDiffKrwPerL / basePriceKrwPerL
fscLowKrwPerL = quarterAverageKrwPerL * (diffRatio * fscLowRate + 1)
fscHighKrwPerL = quarterAverageKrwPerL * (diffRatio * fscHighRate + 1)
```

이 계산은 참고 엑셀 회귀값으로 검증하며, `appliedPriceKrwPerL`은 비교/표시용 값이지 산식 직접 입력값은 아닙니다.

## 1) 설치 방법

### 요구 사항
- Node.js 20.11+
- npm
- PostgreSQL 16+ 또는 Docker Compose
- 유효한 `OPINET_API_KEY`

### 설치
```bash
npm install
```

### 환경 변수 준비
1. `.env.example`를 `.env.local`로 복사합니다.
2. Docker Compose도 쓸 예정이면 `.env`도 따로 만듭니다.
3. `OPINET_API_KEY`와 `DATABASE_URL`을 채우고, 관리자 인증을 쓸 경우 `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`도 함께 채웁니다.
4. `.env.local` / `.env`에는 `NODE_ENV`를 직접 넣지 마세요.
5. `ADMIN_SESSION_SECRET`은 최소 32바이트 이상 무작위 문자열을 사용하세요.

예시:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opinet_diesel_dashboard?schema=public
RUNTIME_FAMILY=container-web-postgres-cron
RUNTIME_ROLE=app
OPINET_DATASET_KEY=national-average-opinet-diesel
QUEUE_DOMAIN=national-average-opinet-diesel
APP_RUNTIME_ID=web-app
WORKER_RUNTIME_ID=scheduled-worker
SCHEDULED_JOB_NAME=scheduled-national-average-ingest
OPINET_API_KEY=replace_with_real_key
OPINET_AVG_PRICE_URL=https://www.opinet.co.kr/api/avgAllPrice.do?out=json
OPINET_RECENT_PRICE_URL=https://www.opinet.co.kr/api/avgRecentPrice.do?out=json
OPINET_STATS_PRICE_URL=https://www.opinet.co.kr/user/dopospdrg/dopOsPdrgSelect.do
POSTGRES_DB=opinet_diesel_dashboard
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
ADMIN_PASSWORD_HASH=
ADMIN_SESSION_SECRET=
ADMIN_SESSION_MAX_AGE_DAYS=14

```

`ADMIN_PASSWORD_HASH`는 아래 명령으로 생성합니다.
```bash
npm run generate:admin-password-hash
```
- 원문 비밀번호는 `.env.example`, GitHub, 코드에 넣지 않습니다.
- 출력된 한 줄만 `ADMIN_PASSWORD_HASH=` 값으로 복사합니다.


고정해야 하는 값:
- `RUNTIME_FAMILY=container-web-postgres-cron`
- `OPINET_DATASET_KEY=national-average-opinet-diesel`
- `QUEUE_DOMAIN=national-average-opinet-diesel`

## 2) 실행 방법

### A. 로컬 PostgreSQL + 로컬 앱
PostgreSQL을 직접 띄운 뒤:
```bash
npx prisma migrate deploy
npm run ingest:opinet
npm run sync:indicators
npm run dev
```

브라우저:
- 대시보드: `http://localhost:3000`



### B. production 모드 로컬 실행
```bash
npm run build
npm run start
```

`npm run build` / `npm run start`는 내부에서 `NODE_ENV=production`을 강제로 사용합니다.

### C. Docker Compose 실행
```bash
docker compose up --build
```

Compose 구성:
- `postgres`: PostgreSQL
- `app`: Next.js 앱
- `worker`: worker entrypoint 실행

주의:
- Compose의 `worker` 서비스는 컨테이너 시작 시 `npm run worker`를 한 번 실행합니다.
- 반복 스케줄링은 운영 환경의 cron / Task Scheduler / 배치 시스템이 맡아야 합니다.

### D. Vercel 배포
배포용 build는 Prisma Client 생성까지 포함한 아래 스크립트를 사용합니다.

```bash
npm run vercel-build
```

Production DB 반영은 아래 순서를 권장합니다.
```bash
npx prisma migrate deploy
npm run vercel-build
```

Vercel production 주소:
- `https://fsc-forecast.vercel.app`

### E. Vercel 환경변수
필수:
- `DATABASE_URL`
- `OPINET_API_KEY`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`

기본값 허용:
- `ADMIN_SESSION_MAX_AGE_DAYS=14`

현재 코드 사용 시 함께 유지:
- `OPINET_AVG_PRICE_URL`
- `OPINET_RECENT_PRICE_URL`
- `OPINET_STATS_PRICE_URL`
- `RUNTIME_FAMILY`
- `RUNTIME_ROLE`
- `OPINET_DATASET_KEY`
- `QUEUE_DOMAIN`
- `APP_RUNTIME_ID`
- `WORKER_RUNTIME_ID`
- `SCHEDULED_JOB_NAME`

비밀번호 인증 방식에서 불필요:
- `ADMIN_EMAILS`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

### F. 현재 배포 주소
- Production: `https://fsc-forecast.vercel.app`

- Vercel project: `fsc-forecast`

### G. 주요 public API
- Active quarter: `/api/fsc/active-quarter`
- Quarter list: `/api/fsc/quarters`
- Current FSC result: `/api/fsc/current`
- Quarter FSC result: `/api/fsc/quarter?year=2026&quarter=3`
- Quarter week rows: `/api/fsc/quarter/weeks?year=2026&quarter=3`



The public FSC API serializes Decimal values as strings and returns empty-state responses when a quarter/result is not ready yet.

Vercel 배포는 외부에서 접근 가능한 PostgreSQL `DATABASE_URL`이 필요합니다.


### H. 관리자 인증과 API 보호

- 로그인: `/admin/login`
- 관리자 화면: `/admin`
- 로그아웃: 로그인 후 관리자 화면의 `로그아웃` 버튼
- 비밀번호는 `ADMIN_PASSWORD_HASH`로만 저장하고, 평문은 저장하지 않습니다.
- 세션 쿠키는 `fsc_admin_session`이며 httpOnly + sameSite=strict로 발급됩니다.
- `ADMIN_SESSION_SECRET`을 변경하면 기존 관리자 세션은 모두 무효화됩니다.
- `ADMIN_SESSION_MAX_AGE_DAYS`로 세션 만료일을 조절합니다.
- Vercel에는 `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `ADMIN_SESSION_MAX_AGE_DAYS`를 environment variable로 등록해야 합니다.
- 환경변수가 빠지면 관리자 기능은 우회되지 않고 fail-closed로 차단됩니다.
- 관리자 상태 변경 API는 모두 비밀번호 세션 + same-origin 검사 + JSON content-type 검사를 통과해야 실행됩니다.
- 승인 기록은 현재 `approvedBy = "password-admin"`으로 남기며, 사용자별 인증 도입 시 교체합니다.

### I. 주요 admin API
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `POST /api/fsc/recompute`
- `POST /api/fsc/approve`
- `POST /api/fsc/quarter/rollover`
- `POST /api/fsc/quarter/activate`



## 3) 데이터 수집/처리 명령

## 3.1) Prisma migration과 배포 절차

현재 저장소의 migration 목록:
- `20260706_init`
- `20260710075455_add_quarter_settings`
- `20260710081716_add_fsc_models`

로컬 개발 DB 점검:
```bash
npx prisma validate
npx prisma generate
npx prisma migrate deploy
```

Production / Vercel 배포 시:
```bash
npx prisma migrate deploy
npm run vercel-build
```

주의:
- `20260710081716_add_fsc_models` migration에는 기존 `fsc_results.metadata` 컬럼을 제거하는 구문이 있습니다.
- production에서 해당 컬럼 데이터를 별도로 보존해야 한다면 `npx prisma migrate deploy` 전에 백업 여부를 먼저 확인하세요.

이 프로젝트는 기존 Opinet ingest/forecast/commentary/export 구조를 유지한 채 Quarter/FSC 계층을 추가합니다. `RecomputeSnapshot`은 원천 snapshot이고, `FscResult`/`FscQuarterWeek`는 분기별 계산 이력입니다.

### 오피넷 raw JSON 저장
```bash
npm run fetch:opinet
```
- `.env.local`의 `OPINET_API_KEY`, `OPINET_AVG_PRICE_URL` 사용
- 최근 7일 일평균은 `OPINET_RECENT_PRICE_URL`에서 추가 수집해 `data/oil-price-daily.json`에 누적 반영
- 최근 1주 주간 평균은 `OPINET_STATS_PRICE_URL` 기반 CSV 응답에서 추출해 `data/oil-price-weekly.json`에 저장
- 현재 평균가격 API는 `code`로 먼저 호출하고, 비면 `certkey`로 한 번 더 시도
- 자동차용경유(`D047` 또는 `자동차용경유`)만 반영

### DB 기반 ingest + recompute snapshot 생성
```bash
npm run ingest:opinet
```
- 오피넷 현재 평균 + 최근 7일 일평균을 함께 수집
- revision/current truth 반영
- recompute snapshot 생성
- 월간 집계는 누적된 일별 데이터 기준으로 계산
- 예측 기록이 부족하면 오피넷 제품별 통계 화면의 2분기(4~6월) 주간/월간 평균판매가격을 보강 이력으로 사용해 다음 4주·3개월 예측을 생성
- active quarter 기반 FSC quarter result / week row 재계산 foundation을 포함합니다.


### 외부 지표 동기화
```bash
npm run sync:indicators
```
대상:
- WTI: `DCOILWTICO`
- Brent: `DCOILBRENTEU`
- Dubai: `POILDUBUSDM`
- USD/KRW: `DEXKOUS`

### worker 실행
macOS/Linux:
```bash
RUNTIME_ROLE=worker npm run worker
```

PowerShell:
```powershell
$env:RUNTIME_ROLE = "worker"
npm run worker
```

cmd.exe:
```cmd
set RUNTIME_ROLE=worker && npm run worker
```

## 4) 폴더 구조

```text
app/
  page.tsx                # 대시보드 진입점
src/
  components/             # 대시보드 UI 컴포넌트
  lib/
    opinet/               # 오피넷 fetch/정규화/저장
    ingest/               # ingest run, reconcile, snapshot
    external-indicators/  # FRED 지표 수집/저장
    aggregates/           # 주간/월간 집계
    forecast/             # 4주/3개월 예측
    commentary/           # 규칙 기반 해설
    dashboard/            # 대시보드 데이터 로더
    fsc/                  # FSC 계산, 주차 생성, 결과 직렬화, 재계산
    quarter/              # active quarter 계산/rollover/helper
    queue.ts              # serialized lane / advisory lock
    env.ts                # 런타임 env 검증
    db.ts                 # Prisma client
  worker/
    index.ts              # worker entrypoint
scripts/
  fetch-opinet.ts         # raw JSON fetch
  run-opinet-ingest.ts    # DB ingest 실행
  sync-external-indicators.ts # 외부 지표 sync 실행

prisma/
  schema.prisma           # DB 스키마
  migrations/             # 마이그레이션

data/
  oil-price-daily.json    # raw 일별 전국 평균 경유가
  oil-price-weekly.json   # raw 주간 전국 평균 경유가
artifacts/                # 검증 산출물
```

## 5) 자동 실행 방법

현재 repo가 제공하는 자동화 포인트는 `worker` entrypoint입니다. 반복 실행 자체는 외부 스케줄러가 호출해야 합니다.

### 권장 흐름
1. `npm run sync:indicators`
2. `RUNTIME_ROLE=worker npm run worker`
3. 앱은 최신 snapshot 기준으로 대시보드를 제공합니다


### Linux cron 예시
```cron
0 9 * * * cd /path/to/project && /usr/bin/npm run sync:indicators >> logs/indicator-sync.log 2>&1
10 9 * * * cd /path/to/project && RUNTIME_ROLE=worker /usr/bin/npm run worker >> logs/worker.log 2>&1
```

### Windows 작업 스케줄러 예시
- 프로그램: `npm`
- 인수: `run sync:indicators`
- 시작 위치: 프로젝트 루트

별도 작업 하나 더:
- 프로그램: `cmd.exe`
- 인수: `/c set RUNTIME_ROLE=worker && npm run worker`
- 시작 위치: 프로젝트 루트

### Docker Compose 기반 운영 시
- `app`은 계속 떠 있을 수 있습니다.
- `worker`는 1회 실행용입니다.
- 반복 실행이 필요하면 호스트 스케줄러나 별도 job runner가 `docker compose run --rm worker` 또는 동등한 배치 실행을 호출해야 합니다.

## 6) 오류 대응 방법

### 1. `Missing required environment variable`
원인:
- `.env.local` 또는 `.env` 누락
- `OPINET_API_KEY`, `DATABASE_URL` 미설정

대응:
- `.env.example`를 복사했는지 확인
- 키 이름 오타 확인
- 앱/worker를 다시 실행

### 2. `RUNTIME_FAMILY must remain locked ...`
원인:
- 고정된 MVP 값을 바꾼 경우

대응:
- 아래 값으로 되돌립니다.
  - `RUNTIME_FAMILY=container-web-postgres-cron`
  - `OPINET_DATASET_KEY=national-average-opinet-diesel`
  - `QUEUE_DOMAIN=national-average-opinet-diesel`

### 3. `npm run build` 실패
대응 순서:
```bash
npm install
npx tsc --noEmit
npm run build
```
추가 확인:
- `.env.local`에 `NODE_ENV`를 넣지 않았는지 확인
- `npm run build`는 production으로 강제되므로, 임의 env override를 제거

### 4. 오피넷 호출은 되는데 데이터가 비어 있음
대응:
- `.env.local`의 `OPINET_API_KEY` 확인
- `.env.local`의 `OPINET_AVG_PRICE_URL`이 `https://www.opinet.co.kr/api/avgAllPrice.do?out=json`인지 확인
- `.env.local`의 `OPINET_RECENT_PRICE_URL`이 `https://www.opinet.co.kr/api/avgRecentPrice.do?out=json`인지 확인
- `.env.local`의 `OPINET_STATS_PRICE_URL`이 `https://www.opinet.co.kr/user/dopospdrg/dopOsPdrgSelect.do`인지 확인
- `npm run fetch:opinet` 재실행
- 오피넷이 빈 응답을 주면 현재 주간 미발표 구간인지, 또는 키 권한/쿼리 조합 문제인지 먼저 의심
- 예측이 비어 있으면 `npm run ingest:opinet`로 최신 snapshot과 forecast run을 다시 생성하고, 부족한 이력은 오피넷 2분기 주간/월간 평균판매가격 보강으로 채워지는지 확인

### 5. Prisma / DB 연결 실패
대응:
- PostgreSQL이 실제로 떠 있는지 확인
- `DATABASE_URL` 호스트/포트/DB명 확인
- 필요하면 아래 순서로 재동기화
```bash
npx prisma generate
npx prisma migrate deploy
```

### 6. 대시보드가 비가용 상태로 표시됨
원인:
- ingest/recompute snapshot이 아직 없음

대응:
```bash
npm run ingest:opinet
npm run sync:indicators
npm run dev
```

### 7. 대시보드 데이터가 비어 있거나 준비 전으로 보임
원인:
- 최신 성공 snapshot 기준 데이터가 아직 없음

대응:
- `npm run ingest:opinet` 먼저 실행
- 필요하면 `npm run sync:indicators`도 함께 실행

## 7) 빠른 점검 순서

로컬에서 최소 점검:
```bash
npm install
npx prisma migrate deploy
npm run fetch:opinet
npm run ingest:opinet
npm run sync:indicators
npm run dev
```

배포 전 점검:
```bash
npx tsc --noEmit
npm run build
```

## 8) package scripts
- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run start` — production server
- `npm run fetch:opinet` — raw fetch to `data/oil-price-daily.json` and `data/oil-price-weekly.json`
- `npm run ingest:opinet` — DB-backed ingest + recompute snapshot + forecast 생성
- `npm run sync:indicators` — 외부 지표 sync
- `npm run worker` — scheduled worker entrypoint
- `npm run vercel-build` — Vercel용 Prisma generate + production build
- `npm run generate:admin-password-hash` — 관리자 비밀번호를 숨김 입력으로 hash 생성
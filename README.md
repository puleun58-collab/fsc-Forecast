# FSC Forecast

전국 평균 자동차용 경유가를 오피넷에서 수집해 주간·월간 집계, 4주·3개월 예측, 분기별 연료할증료(FSC) 계산으로 연결하는 운영 대시보드입니다.

## 배포 주소

- Production: https://fsc-forecast.vercel.app
- 로컬 개발 서버: http://localhost:3000
- 대시보드는 활성 분기의 최신 base FSC 결과를 표시합니다.
- 배포 환경과 로컬 환경은 같은 데이터베이스 계약을 확인해야 합니다.
- 배포 전후 환경 변수와 migration 상태를 함께 점검합니다.

## 주요 기능

- 오피넷 전국 평균 자동차용 경유가를 수집합니다.
- 가격 revision과 current truth를 reconcile하고 계산 기준 snapshot을 보존합니다.
- 주간·월간 가격 이력을 대시보드에서 확인합니다.
- 4주 및 3개월 가격 예측을 생성합니다.
- 활성 분기 기준으로 FSC 결과와 주차별 actual/forecast를 계산합니다.
- 데이터 최신성, 승인 상태, 신뢰도와 외부 시장 참고 지표를 함께 표시합니다.
- 관리자 UI와 인증된 상태 변경 API를 제공합니다.

## 핵심 데이터 흐름

1. 오피넷과 외부 지표에서 원천 데이터를 가져옵니다.
2. ingest가 가격 revision을 기록하고 날짜별 현재 값을 reconcile합니다.
3. recompute snapshot이 계산 시점의 current truth를 고정합니다.
4. snapshot을 기준으로 주간·월간 forecast를 생성합니다.
5. 활성 분기 설정과 가격·forecast를 사용해 FSC를 계산합니다.
6. 대시보드는 최신 결과와 보조 시장 데이터를 읽어 표시합니다.

이 흐름은 원천 데이터 수정 이후에도 결과의 계산 근거를 추적할 수 있도록 설계되어 있습니다.
세부 모델 관계와 계산 불변조건은 [아키텍처 문서](docs/architecture.md)를 기준으로 합니다.

## 기술 스택

- Node.js 20.11 이상
- TypeScript
- Next.js 14
- React 18
- PostgreSQL
- Prisma
- Zod
- Docker Compose
- GitHub Actions
- `tsx` 기반 ingest 및 worker 실행 진입점

개발과 운영 환경 모두 npm scripts와 Prisma migration을 기준으로 실행합니다.
구성 요소와 시스템 경계는 [기술 스택 상세](docs/architecture.md#technology-stack)에서 확인합니다.

## 빠른 시작

로컬 PostgreSQL 또는 Docker Compose로 데이터베이스를 먼저 준비합니다. 환경별 세부 절차는 [배포 및 설치](docs/deployment.md#quick-start)를 기준으로 합니다.

1. 의존성을 설치합니다.

   ```bash
   npm install
   ```

2. `.env.example`을 `.env.local`로 복사합니다.

   ```bash
   cp .env.example .env.local
   ```

3. 필수 환경 변수를 입력합니다.

4. migration을 적용합니다.

   ```bash
   npx prisma migrate deploy
   ```

5. 외부 지표를 동기화합니다.

   ```bash
   npm run sync:indicators
   ```

6. 오피넷 데이터를 ingest합니다.

   ```bash
   npm run ingest:opinet
   ```

7. 개발 서버를 시작합니다.

   ```bash
   npm run dev
   ```

시작 후 http://localhost:3000에서 대시보드를 확인합니다.

## 필수 환경 변수

값, 고정 규칙, 비밀값 설정 절차는 상세 문서에서 관리합니다.

| 구분 | 변수 |
|---|---|
| 데이터베이스 | `DATABASE_URL` |
| 런타임 | `RUNTIME_FAMILY`, `RUNTIME_ROLE` |
| 데이터셋·큐 | `OPINET_DATASET_KEY`, `QUEUE_DOMAIN` |
| 런타임 식별 | `APP_RUNTIME_ID`, `WORKER_RUNTIME_ID`, `SCHEDULED_JOB_NAME` |
| 오피넷 인증 | `OPINET_API_KEY` |
| 오피넷 URL | `OPINET_AVG_PRICE_URL`, `OPINET_RECENT_PRICE_URL`, `OPINET_STATS_PRICE_URL` |
| PostgreSQL 초기화 | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| 관리자 인증 | `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `ADMIN_SESSION_MAX_AGE_DAYS` |

비밀값, 실제 접속 문자열, 관리자 세션 비밀은 저장소와 로그에 기록하지 않습니다.

## 주요 npm 명령어

| 명령어 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 시작 |
| `npm run build` | production build |
| `npm run start` | production 서버 시작 |
| `npm run vercel-build` | Vercel build 진입점 |
| `npm run lint` | Next.js lint |
| `npm run worker` | scheduled worker 실행 |
| `npm run fetch:opinet` | 오피넷 raw cache 수집 |
| `npm run ingest:opinet` | DB ingest, reconcile, snapshot, forecast 생성 |
| `npm run sync:indicators` | 외부 지표 동기화 |
| `npm run generate:admin-password-hash` | 관리자 비밀번호 hash 생성 |
| `npm run doctor` | React Doctor 진단 |

명령의 입력, 결과 판정, 반복 실행, 실패 처리는 운영 및 문제 해결 문서를 기준으로 합니다.

## 상세 문서

- [아키텍처](docs/architecture.md): 시스템 경계, 데이터 흐름, 계산 근거와 기술 구성의 canonical 설명입니다.
- [대시보드 명세](docs/dashboard-spec.md): 화면 상태, actual/forecast 표시, 날짜·수치 형식과 상태 태그 규칙입니다.
- [배포 및 설치](docs/deployment.md): 요구 사항, 환경 변수, migration, 로컬·production 배포 절차를 다룹니다.
- [운영](docs/operations.md): raw 수집, ingest, 지표 동기화, worker와 결과 판정 절차를 다룹니다.
- [문제 해결](docs/troubleshooting.md): 환경, 데이터베이스, 수집, 대시보드 장애의 진단과 복구 기준입니다.
- [API 계약](docs/api.md): public FSC 및 관리자 API route, 인증, 응답 규칙의 canonical 계약입니다.

상세 동작과 운영 절차는 위 문서가 단일 기준입니다.

## 주의사항

- 오피넷 API 키와 관리자 인증 정보는 비밀값으로 취급합니다.
- raw cache 갱신과 DB ingest는 목적이 다르므로 결과를 구분해 확인합니다.
- cache refresh 실패는 DB reconcile, snapshot, forecast와 별도의 상태로 기록될 수 있습니다.
- worker는 외부 지표 동기화 후 ingest 흐름을 실행합니다.
- 대시보드 결과가 없거나 비가용이면 데이터 기준 시각과 최신 ingest 결과를 먼저 확인합니다.
- 환경 변수의 잠긴 dataset·queue·runtime 계약은 임의 별칭으로 바꾸지 않습니다.
- API route와 관리자 UI의 상세 요청·응답·인증 규칙은 API 계약 문서를 기준으로 합니다.
- 데이터 또는 환경을 변경하기 전에는 해당 배포·운영·문제 해결 절차를 확인합니다.

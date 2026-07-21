# 문제 해결

이 문서는 증상별 진단과 안전한 복구 기준을 소유한다. 실행 명령의 전체 순서와 스케줄러 설정은 [운영 문서](operations.md#command-catalog) 및 [배포 문서](deployment.md#quick-start)를 따른다.

<a id="missing-required-environment"></a>
## Missing required environment variable

- **증상:** 시작 시 `Missing required environment variable: ...`가 표시된다.
- **확인:** 오류에 표시된 변수 이름과 배포 환경 또는 로컬 환경 파일의 이름을 대조한다. `DATABASE_URL`은 런타임 필수값이며 관리자 기능에는 별도 인증 환경변수가 필요하다.
- **안전한 복구:** [환경 변수](deployment.md#environment-variables)의 해당 항목을 올바른 실행 환경에 설정한다. 비밀값을 로그나 저장소에 기록하지 말고, 값을 반영한 프로세스만 다시 시작한다.
- **성공 기준:** 같은 환경 검증 오류 없이 앱 또는 worker가 시작된다.

<a id="locked-runtime-configuration"></a>
## 잠긴 런타임 구성 오류

- **증상:** `RUNTIME_FAMILY must remain locked ...` 또는 잠긴 dataset/queue 값 오류가 발생한다.
- **확인:** `RUNTIME_FAMILY`, `OPINET_DATASET_KEY`, `QUEUE_DOMAIN`의 설정이 [배포 환경 변수](deployment.md#environment-variables)의 고정 계약과 일치하는지 확인한다. `RUNTIME_ROLE`은 `app` 또는 `worker`만 허용된다.
- **안전한 복구:** 임의 값이나 환경별 별칭을 제거하고 배포 문서의 계약값으로 되돌린다. 역할만 실행 목적에 맞게 설정한다.
- **성공 기준:** 런타임 환경 검증을 통과하고 의도한 app 또는 worker 역할로 시작된다.

<a id="build-failure"></a>
## build 실패

- **증상:** `npm run build`가 실패하거나 타입 오류가 보고된다.
- **확인:** `.env.local`에 `NODE_ENV`를 직접 설정하지 않았는지 확인한다. 먼저 `npx tsc --noEmit`로 타입 오류 위치를 확인하고, build 출력의 최초 오류를 기준으로 원인을 분리한다.
- **안전한 복구:** [로컬 production 실행](deployment.md#local-production-and-compose)의 의존성 및 환경 준비 상태를 복구한 뒤 타입 오류를 수정하고 다시 build한다. 진단 명령의 상세 순서는 배포 문서를 따른다.
- **성공 기준:** 타입 검사와 production build가 모두 성공한다.

<a id="empty-opinet-data"></a>
## 빈 오피넷 데이터

- **증상:** 오피넷 요청은 완료되지만 수집 행 또는 예측 입력 데이터가 비어 있다.
- **확인:** `OPINET_API_KEY`와 세 오피넷 URL 설정을 [환경 변수](deployment.md#environment-variables)와 대조한다. 현재 주간의 미발표 구간인지, 키 권한 또는 요청 조합 문제인지 확인한다.
- **안전한 복구:** 비밀값을 노출하지 않고 설정을 바로잡은 뒤 [운영 명령](operations.md#command-catalog)의 raw fetch 또는 ingest를 다시 실행한다. 예측 입력이 부족한 경우 ingest 결과의 snapshot·forecast 상태를 함께 확인한다.
- **성공 기준:** 대상 데이터가 수집되고 ingest 결과에 최신 snapshot과 forecast 상태가 기록된다.

<a id="prisma-or-database-connection"></a>
## Prisma 또는 데이터베이스 연결 실패

- **증상:** Prisma 초기화, 연결 또는 쿼리에서 실패한다.
- **확인:** PostgreSQL 실행 상태와 `DATABASE_URL`의 호스트·포트·데이터베이스 대상을 확인한다. 앱과 scheduled worker가 같은 의도한 DB를 가리키는지도 확인한다.
- **안전한 복구:** 연결 대상을 바로잡고 [마이그레이션](deployment.md#migrations)의 검증·생성·배포 절차를 적용한다. 데이터 변경 전에는 배포 문서의 안전 조건을 확인한다.
- **성공 기준:** Prisma가 연결되고 필요한 migration이 적용되며 API 또는 ingest 쿼리가 완료된다.

<a id="dashboard-unavailable"></a>
## 대시보드 비가용

- **증상:** 대시보드가 비가용 상태를 표시한다.
- **확인:** 최신 ingest/recompute snapshot이 존재하는지와 앱의 DB 연결 상태를 확인한다.
- **안전한 복구:** [운영 문서](operations.md#command-catalog)의 indicator sync와 ingest 실행 결과를 확인하고, 실패 원인을 먼저 복구한 뒤 앱을 다시 제공한다.
- **성공 기준:** 대시보드가 최신 성공 snapshot을 읽고 화면 상태를 정상으로 표시한다.

<a id="dashboard-empty-or-not-ready"></a>
## 대시보드가 비어 있거나 준비 전

- **증상:** 화면 또는 public FSC API가 결과 없음/준비 전 상태를 반환한다.
- **확인:** active quarter는 존재하지만 해당 분기의 FSC 결과가 아직 없을 수 있다. `/api/fsc/current` 또는 분기 조회 응답의 `empty: true`, `FSC_RESULT_NOT_FOUND`를 확인한다.
- **안전한 복구:** [운영 문서](operations.md#command-catalog)에서 ingest를 완료해 snapshot·forecast를 갱신하고, 필요한 경우 인증된 관리자가 FSC 재계산을 수행한다. API 입력·응답 계약은 [API 문서](api.md#public-fsc-routes)를 따른다.
- **성공 기준:** 대상 분기에 결과가 생성되고 `empty` 응답 대신 FSC 데이터가 반환된다.

<a id="indicator-or-cache-partial-success"></a>
## indicator 또는 cache 부분 성공

- **증상:** worker 최종 `status`가 `succeeded`인데 시장 지표 또는 오피넷 cache가 최신이 아니다.
- **확인:** 전체 worker 성공만으로 최신성을 판단하지 않는다. `indicatorSync.status`, `indicatorSync.errorSummary`, `indicatorStatuses`를 확인한 뒤 `cacheRefresh.status`, `cacheRefresh.errorSummary`와 daily·weekly·monthly·quarterly의 fetched/saved 수를 확인한다.
- **안전한 복구:** 실패한 지표 또는 cache의 오류 요인을 수정한 뒤 [부분 성공 계약과 반복 실행](operations.md#partial-success-contract)을 따라 해당 작업을 다시 실행한다. 정상 관측값은 실패한 지표에서 유지될 수 있으므로 무단 삭제하지 않는다.
- **성공 기준:** 각 indicator 상태와 cache refresh 상태가 성공이고 네 cache의 수집·저장 수가 기대값과 일치하며 ingest·snapshot·forecast 상태도 완료된다.

<a id="quick-check-order"></a>
## 빠른 점검 순서

1. 실행 환경의 필수 변수와 잠긴 런타임 구성을 [배포 환경 변수](deployment.md#environment-variables)에서 확인한다.
2. 데이터베이스 연결과 migration 상태를 [배포 문서](deployment.md#migrations) 기준으로 확인한다.
3. 오피넷 raw fetch, indicator sync, ingest의 순서와 결과를 [운영 명령](operations.md#command-catalog)에서 확인한다.
4. worker를 사용했다면 indicator·cache 부분 성공 필드를 확인한다.
5. `/api/fsc/current`의 empty 상태와 대시보드 화면 상태를 확인한다.
6. 배포 전 build 문제만 별도로 재현할 때는 [build 실패](#build-failure)의 진단 기준을 적용한다.

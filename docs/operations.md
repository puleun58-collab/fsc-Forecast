# 운영

<a id="opinet-raw-collection"></a>
## 오피넷 raw 수집

raw JSON cache를 갱신할 때 실행합니다.

```bash
npm run fetch:opinet
```

이 명령은 `.env.local`을 우선 읽고 이어서 기본 환경을 읽습니다. `OPINET_API_KEY`, `OPINET_AVG_PRICE_URL`을 사용하며, 최근 7일 일평균은 `OPINET_RECENT_PRICE_URL`에서 추가 수집합니다. 결과는 다음 cache에 저장합니다.

- `data/oil-price-daily.json`
- `data/oil-price-weekly.json`
- `data/oil-price-monthly.json`
- `data/oil-price-quarterly.json`

출력에는 각 daily/weekly/monthly/quarterly cache의 fetched/saved 결과와 output path가 포함됩니다. 네 cache 중 quarterly도 수집·저장 대상이며 생략하지 않습니다.

<a id="database-ingest-and-recompute"></a>
## DB ingest 및 recompute snapshot

DB 기반 ingest, reconcile, snapshot, forecast 생성은 다음 명령으로 실행합니다.

```bash
npm run ingest:opinet
```

이 명령은 Opinet 현재 평균과 최근 7일 일평균을 함께 수집합니다. 동일 날짜가 겹치면 현재 평균 API 값이 최근 7일 API 값보다 우선합니다. 출력에서 `ingestStatus`, `fetchedRowCount`, reconcile의 processed/created/superseded/unchanged/current row 수, snapshot의 ID·current row 수·truth cutoff, `forecast`, `cacheRefresh`를 확인합니다.

`cacheRefresh`는 daily, weekly, monthly, quarterly cache의 `fetchedCount`와 `savedCount`를 제공합니다. cache refresh 실패는 ingest의 DB reconcile, snapshot, forecast를 막지 않는 non-fatal 상태로 기록될 수 있으므로 [partial-success 계약](#partial-success-contract)에 따라 결과를 판정합니다.

<a id="external-indicator-sync"></a>
## 외부 지표 동기화

외부 지표만 동기화할 때 실행합니다.

```bash
npm run sync:indicators
```

반복 운영에서 worker나 스케줄러는 지표 동기화를 먼저 실행한 뒤 Opinet ingest를 실행합니다. 개별 지표 실패 여부와 최신 관측 상태는 worker 결과의 `indicatorSync`와 `indicatorStatuses`에서 확인합니다.

<a id="worker-execution"></a>
## worker 실행

worker는 외부 지표 동기화 후 같은 serialized 흐름에서 Opinet ingest, reconcile, snapshot, forecast를 한 번 실행합니다. worker entrypoint에는 `RUNTIME_ROLE=worker`가 필요합니다.

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

worker는 dataset별 serialized lane과 advisory lock을 사용합니다. 출력의 `status: "succeeded"`는 worker가 완료되었음을 뜻할 뿐, 모든 외부 지표와 cache가 최신이라는 뜻은 아닙니다.

<a id="partial-success-contract"></a>
## partial-success 계약

worker는 indicator sync 오류를 결과에 기록한 뒤 ingest를 계속합니다. ingest도 cache refresh 실패를 non-fatal 상태로 기록한 뒤 DB reconcile, snapshot, forecast를 계속할 수 있습니다. 따라서 overall worker `status: "succeeded"`만으로 성공을 판정하지 않습니다.

다음 순서로 출력 JSON을 점검합니다.

1. `indicatorSync.status`, `indicatorSync.errorSummary`, `indicatorStatuses`에서 지표별 상태와 오류를 확인합니다.
2. `cacheRefresh.status`, `cacheRefresh.errorSummary`를 확인합니다.
3. daily, weekly, monthly, quarterly 각각의 `fetchedCount`와 `savedCount`를 확인합니다.
4. `ingestRun.status`, reconcile 결과, snapshot의 `snapshotId`·`currentRowCount`·`currentTruthCutoffAt`, forecast 결과를 함께 확인합니다.

지표 또는 cache가 실패한 경우에도 snapshot/forecast가 갱신되었을 수 있습니다. 반대로 snapshot/forecast 결과만으로 지표나 네 cache가 모두 최신이라고 판단하지 않습니다. 증상별 안전한 복구와 성공 기준은 [장애 대응 문서](troubleshooting.md#indicator-or-cache-partial-success)를 따릅니다.

<a id="github-actions-scheduled-worker"></a>
## GitHub Actions scheduled worker

`.github/workflows/scheduled-opinet-worker.yml`의 `scheduled-opinet-worker` workflow는 `workflow_dispatch`와 `*/15 * * * *` cron으로 실행됩니다. 동시성 그룹은 `scheduled-opinet-worker-production`이며 진행 중 실행을 취소하지 않습니다.

workflow는 Ubuntu에서 Node 20을 설정하고 다음 순서로 실행합니다.

```bash
npm ci
npx prisma generate
npm run worker
```

`npm run worker`는 외부 지표 동기화가 실패하더라도 실패 상태를 결과에 기록한 뒤
Opinet ingest를 계속합니다. 외부 지표 수집 장애 때문에 Opinet 현재 가격 갱신까지
건너뛰지 않도록 예약 실행에서도 동일한 partial-success 계약을 사용합니다.

필수 GitHub Actions secrets는 `DATABASE_URL`, `OPINET_API_KEY`, `OPINET_AVG_PRICE_URL`, `OPINET_RECENT_PRICE_URL`, `OPINET_STATS_PRICE_URL`입니다. workflow는 시작 전에 `DATABASE_URL`, `OPINET_API_KEY`, `OPINET_AVG_PRICE_URL`이 비어 있지 않은지 검증합니다. `DATABASE_URL`은 Vercel Production DB와 같은 production DB를 가리켜야 하며, `""` 같은 placeholder는 연결 문자열이 아닙니다.

수동 확인은 GitHub `Actions`에서 `scheduled-opinet-worker`를 선택해 `Run workflow`를 실행하고, worker가 끝났는지 및 production 대시보드의 Opinet 경유가·두바이유·USD/KRW 실제 일별 관측 기준일이 갱신됐는지 확인합니다. 성공 판정에는 [partial-success 계약](#partial-success-contract)의 하위 상태도 포함합니다.

<a id="external-schedulers"></a>
## cron 및 Windows 작업 스케줄러

반복 실행은 외부 스케줄러가 담당합니다. Linux cron의 기존 예시는 다음과 같습니다.
cron의 `>> logs/worker.log` redirection은 명령 실행 전에 대상 파일을 열므로, 예시를 설치하기 전에 절대 경로의 쓰기 가능한 로그 디렉터리를 만들어야 한다. 예를 들어 cron을 등록하는 사용자로 한 번 실행한다.

```bash
mkdir -p /path/to/project/logs && test -w /path/to/project/logs
```

`logs/`가 없거나 쓰기 권한이 없으면 아래 cron 작업은 `npm` 명령을 시작하기 전에 실패한다.

```cron
0 9 * * * cd /path/to/project && npm run sync:indicators && npm run ingest:opinet >> logs/worker.log 2>&1
```

Windows 작업 스케줄러에는 다음 값을 사용합니다.

- 프로그램: `cmd.exe`
- 인수: `/c npm run sync:indicators && npm run ingest:opinet`
- 시작 위치: 프로젝트 루트

두 예시는 지표 동기화 후 ingest를 실행합니다. one-shot worker를 스케줄하려면 [worker 실행](#worker-execution)의 `RUNTIME_ROLE=worker npm run worker` 계약을 사용합니다.

<a id="compose-operations"></a>
## Compose 운영

Compose의 `app`은 계속 실행될 수 있지만 `worker`는 한 번 실행되는 서비스입니다. 반복 실행이 필요하면 호스트 스케줄러 또는 별도 job runner가 다음 명령을 호출합니다.

```bash
docker compose run --rm worker
```

Compose worker도 migration을 적용한 뒤 worker를 실행합니다. 실행 후에는 worker의 indicator/cache/ingest/snapshot/forecast 결과를 [partial-success 계약](#partial-success-contract)으로 판정합니다.

<a id="operational-checklist"></a>
## 점검 체크리스트

- production `DATABASE_URL`을 사용하는 앱과 GitHub Actions가 같은 DB를 가리키는지 확인합니다.
- `scheduled-opinet-worker` workflow가 disabled 상태가 아닌지 확인합니다.
- `workflow_dispatch` 또는 외부 스케줄러의 한 번 실행 결과에서 지표 동기화와 ingest 단계를 확인합니다.
- `indicatorSync`, `indicatorStatuses`, `cacheRefresh` 및 daily/weekly/monthly/quarterly count를 확인합니다.
- snapshot과 forecast 결과, production 대시보드의 최신 데이터 기준 시각과 실제 일별 관측 기준일을 확인합니다.
- `/api/fsc/current`와 홈 화면에서 Opinet 값 및 출처 관측 기준 갱신 여부를 확인합니다.

<a id="command-catalog"></a>
## 명령 카탈로그

| 명령 | 반복 운영에서의 용도 |
|---|---|
| `npm run fetch:opinet` | daily/weekly/monthly/quarterly raw JSON cache를 갱신합니다. |
| `npm run ingest:opinet` | DB ingest, cache refresh, reconcile, snapshot, forecast를 실행합니다. |
| `npm run sync:indicators` | 외부 지표를 동기화합니다. |
| `npm run worker` | `RUNTIME_ROLE=worker`에서 one-shot scheduled worker를 실행합니다. |
| `RUNTIME_ROLE=worker npm run worker` | macOS/Linux에서 worker 역할로 실행합니다. |
| `docker compose run --rm worker` | Compose worker를 one-shot으로 실행합니다. |
| `npm ci` | GitHub Actions workflow의 의존성 설치 단계입니다. |
| `npm run lint` | 수동 진단용 lint 명령입니다. |
| `npm run doctor` | 수동 진단용 React Doctor 명령입니다. |

`npm run lint`와 `npm run doctor`는 문서 변경 QA로 실행하지 않습니다. 설치, migration, 배포 및 one-time credential provisioning은 [배포 문서](deployment.md)를 따릅니다.

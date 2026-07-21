# 아키텍처

FSC Forecast는 전국 평균 자동차용 경유가를 수집·정규화하고, 분기별 연료할증료(FSC) 산출 이력과 주차별 actual/forecast 근거를 보관하는 Next.js 애플리케이션이다. 대시보드는 활성 분기의 최신 base 시나리오 결과를 읽는다.

<a id="system-boundaries"></a>
## 시스템 경계

- **입력:** 오피넷 전국 평균 경유가와 외부 지표 관측값이다. 원천 응답과 수집 이력은 DB에 남는다.
- **처리:** ingest가 가격 revision과 현재 진실(current truth)을 reconcile하고, recompute snapshot과 forecast를 기준 시점별로 생성한다.
- **산출:** FSC 재계산은 활성 분기와 성공한 snapshot을 사용하며, forecast run은 연결 가능할 때 참조해 `FscResult`와 주차 행을 새로 생성한다.
- **표시:** 홈 대시보드는 활성 분기와 그 분기의 최신 base `FscResult`를 읽는다. 화면 상태와 표시 정책은 [대시보드 명세](dashboard-spec.md#screen-states)에 둔다.

<a id="technology-stack"></a>
## 기술 스택

- Node.js 20.11 이상, TypeScript, Next.js 14, React 18
- Prisma 5와 PostgreSQL
- `tsx` 기반 ingest·worker 실행 진입점
- Docker Compose 및 GitHub Actions 기반 실행 환경
- Zod 환경 검증과 `cross-env` 기반 production 스크립트

<a id="data-flow"></a>
## 데이터 흐름

1. 오피넷 수집 결과는 `IngestRun`에 연결된 append-only `PriceRevisionLog`로 기록된다.
2. reconcile은 날짜별 `DailyPriceCurrent`가 가리키는 현재 revision을 갱신한다. 이전 revision은 삭제하거나 덮어쓰지 않는다.
3. `RecomputeSnapshot`은 특정 current truth cutoff와 triggering ingest run을 가리키는 계산 기준점이다. snapshot에는 forecast·commentary·export·FSC 결과가 연결된다.
4. forecast pipeline은 snapshot별 `ForecastRun`과 weekly/monthly `ForecastPoint`를 생성한다.
5. FSC 재계산은 snapshot의 일별 진실, 공식 주간·월간 가격, forecast point를 읽어 `FscResult`와 `FscQuarterWeek`를 기록한다.
6. 대시보드는 성공한 최신 snapshot의 보조 시장 데이터와 활성 분기의 최신 base 결과를 함께 로드한다.

<a id="current-truth-revision-snapshot"></a>
## 현재 진실, revision, snapshot

`PriceRevisionLog`은 관측 가격, 원천 관측 시각, 원천 revision token·payload, ingest run 및 supersession 관계를 보관한다. `DailyPriceCurrent`는 dataset/date별로 유일하며 `currentRevisionId`로 현재 채택 revision을 참조하고, 마지막으로 연결된 recompute snapshot도 보관한다.

`RecomputeSnapshot`은 `currentTruthCutoffAt`, 상태, 실행 시각, 오류 요약과 metadata를 가진다. forecast와 FSC 결과는 이 snapshot을 외래 키로 참조한다. 따라서 이후 원천 가격이 수정되어도 기존 FSC 결과가 어떤 snapshot을 근거로 했는지 추적할 수 있다.

<a id="active-quarter-and-rollover"></a>
## Active Quarter와 rollover

`QuarterSetting`은 대상/참조 연도·분기, 분기 시작·종료일, 기준유가·현재 적용유가, 두 FSC 비율, 상태를 가진다. `activeKey = "ACTIVE"`의 unique 제약으로 활성 분기는 하나만 유지한다.

`ensureActiveQuarter()`는 advisory transaction lock 아래 활성 분기를 읽는다. 활성 분기와 기존 설정이 모두 없으면 초기값으로 2026년 3분기(참조 2026년 2분기)를 생성한다. 활성 분기는 없지만 설정이 있으면 가장 최근 분기를 활성화하고, 그 분기가 이미 만료됐으면 rollover를 이어서 수행한다. 활성 분기 종료일이 지났으면 이전 분기를 `closed`로 전환하고 다음 분기를 생성하거나 기존 설정을 활성화한다. 다음 분기는 이전 분기의 가격·비율을 복사하고, 참조 분기는 다음 대상 분기의 직전 분기로 설정한다.

<a id="fsc-result-and-weeks"></a>
## FSC 결과와 주차 관계

`FscResult`는 분기·시나리오(`base`)별 산출 이력이다. source recompute snapshot은 필수이고 forecast run은 없을 수 있다. 결과에는 입력 가격, 분기 평균, 차이·차이율, FSC 결과, actual/forecast 주차 수, 신뢰도·freshness·승인 상태, calculation payload가 저장된다.

`FscQuarterWeek`은 각 `FscResult`에 종속된 순서 있는 주차 행이다. 행은 기간, ISO 주 번호, 선택 가격, actual/forecast 가격, 원천 revision ID, forecast point와 source kind, fallback 사용 여부, 기준 대비 차이와 차이율을 보관한다. `(fscResultId, sequenceNo)`는 유일하다.

재계산은 기존 결과를 갱신하지 않고 새 `FscResult`와 그 주차 행을 생성한다. `QuarterSetting`과 snapshot은 결과 삭제를 제한하고, 연결된 forecast run이 삭제되면 결과의 참조만 null로 전환된다. 이 관계는 산출 결과와 계산 근거의 immutable 이력을 보존한다. 승인 시에는 기존 `FscResult`의 `approvalStatus`, `approvedBy`, `approvedAt`을 갱신하므로 별도의 immutable 승인 이벤트 이력은 제공하지 않는다.

<a id="actual-first-and-fallback"></a>
## actual-first와 forecast fallback

분기 경계에 맞춘 오피넷 주차마다 actual 가능 여부를 먼저 판정한다. 해당 기간의 일별 가격이 모두 있고 완료된 기간이면 일별 평균을 사용한다. 공식 주간 가격이 기간과 겹치면 이를 우선 사용한다. actual 행은 `priceKind = actual`이며 fallback을 사용하지 않는다.

actual이 아니면 forecast 행을 만들며 가격 출처의 우선순위는 다음과 같다.

1. 같은 주 종료일의 weekly forecast point
2. 해당 월의 monthly forecast point
3. 주 종료일 이하에서 가장 최근 forecast point를 유지
4. 양수인 현재 적용유가
5. 기준유가

3~5는 `fallbackUsed = true`로 기록된다. 선택 출처는 `weekly_point`, `monthly_point`, `carry_forward`, `applied_price_fallback`, `base_price_fallback`으로 보존된다. 특히 4~5는 forecast point가 없는 경우에도 결과 계산에 사용되는 가격 fallback이다. 이 구현은 결과를 별도의 degraded 상태로 바꾸거나 승인·freshness 상태를 제외하지 않는다. 소비자는 결과 전체와 주차 행의 `fallbackUsed`, `forecastSourceKind`를 함께 확인해야 한다.

<a id="fsc-formula"></a>
## FSC 계산식과 formula version

현재 formula version은 `fsc-v1`이다. 모든 가격은 소수 셋째 자리, 비율은 소수 여섯째 자리, FSC 비율은 소수 넷째 자리에서 half-up 반올림한다. 기준유가와 분기 평균 예상 유가는 0보다 커야 하며, 비율은 0~1이고 low 비율은 high 비율보다 클 수 없다.

- `priceDiff = quarterAverage - basePrice`
- `diffRatio = priceDiff / basePrice`
- `fscLow = quarterAverage × (1 + diffRatio × fscLowRate)`
- `fscHigh = quarterAverage × (1 + diffRatio × fscHighRate)`

`appliedPriceKrwPerL`은 결과에 함께 기록되며 forecast fallback에만 사용될 수 있다. 계산식의 기준 가격은 `basePriceKrwPerL`이다.

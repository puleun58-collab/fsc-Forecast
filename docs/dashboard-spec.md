# 대시보드 명세

홈 대시보드는 랜딩 페이지형 hero나 반복 KPI 카드가 아니라 `Fuel Operations Ledger` 콘셉트의 의사결정 화면이다. 분기 평균 예상 유가를 먼저 제시하고, FSC 30%·70% 등 설정된 비율의 파생 결과와 actual/forecast 경계를 같은 흐름에서 읽게 한다.

<a id="screen-states"></a>
## 화면 상태

`loadFscDashboardData()`는 활성 분기를 먼저 보장한 뒤 최신 base FSC 결과와 보조 데이터를 로드한다.

- **available:** 활성 분기의 결과가 있으면 전체 대시보드를 렌더링한다. forecast point가 없어 현재 적용유가 또는 기준유가 fallback으로 계산된 결과도 available일 수 있다. DecisionSummary에는 fallback 표기가 없으며 provenance는 주차 상세의 `대체값 사용`과 source kind에서 확인한다.
- **empty:** 활성 분기는 있으나 base 결과가 없으면 재계산이 필요하다는 상태, 대상 분기, 유가 이력·시장 참고값·데이터 출처를 표시한다.
- **unavailable:** 활성 분기 또는 데이터 로드 중 예외가 발생하면 사유, 구현이 전달한 `detail`(상세 오류), 데이터 출처를 표시한다. 이 상세 오류는 공개 화면에 내부 DB·provider·configuration 등의 정보를 노출할 수 있으므로 운영자는 공개 노출 위험을 전제로 확인·대응해야 한다. 현재 correlation ID 부여나 오류 sanitization 계약은 없다.

<a id="layout-and-components"></a>
## 화면 구성

available 상태의 구성 순서는 다음과 같다.

1. **DashboardHeader:** 서비스명, Active quarter 선택 표시, 데이터 기준 시각을 보여 준다. 현재는 활성 분기 한 개만 가진 enabled select이므로 실질적인 선택 동작은 없다.
2. **StatusRail:** 데이터 freshness, 승인 상태, 신뢰도를 태그로 표시하고 결과 생성 시각을 덧붙인다.
3. **DecisionSummary:** 최신 actual 주차 평균 유가, 분기 평균 예상 유가, 기준유가·현재 적용유가, 기준 대비 차이, actual/forecast 주차 수와 FSC 시나리오 결과를 표시한다. 하나 이상의 forecast 주차가 `applied_price_fallback` 또는 `base_price_fallback`이면 이 summary의 결과도 해당 fallback을 입력으로 사용한 것이다. DecisionSummary 자체는 현재 fallback 표기를 추가하지 않으므로, 해당 결과의 `대체값 사용` 및 source kind는 WeeklyDetailTable에서 확인해야 한다. 이 fallback은 현재 승인 상태나 freshness 판정을 변경하지 않는다.

최신 actual 주차 카드의 금액 아래에는 바로 전 sequence의 actual 주차가 있을 때 `전주 대비 {금액 차이}원 · {증감률}% {방향 아이콘}`을 표시한다. 차이와 증감률은 소수점 둘째 자리까지 표시하고 상승·하락·변동 없음은 각각 `+`·`-`·`↑`·`↓`·`→`와 색상을 함께 사용한다. 비교할 전주 actual이 없으면 문구를 표시하지 않는다.
4. **OilPriceHistory:** 저장된 일별·주별·월별·분기별 오피넷 이력을 표시한다.
5. **WeeklyForecastSection:** 주차별 actual/forecast 추이와 기준유가 선을 표시한다.
6. **WeeklyDetailTable:** 주차별 가격·기간·상태·기준 대비 차이·차이율·산출 방식을 표와 모바일 그룹으로 표시한다.
7. **MarketReferencePanel:** 오피넷 현재 참고값, 최근 추이, 주요 시장 요인을 보조 정보로 표시한다.
8. **MethodologyDisclosure, DataSourcesDisclosure:** 산출 방법과 데이터 출처·기준 시각을 공개한다.

<a id="actual-forecast-display"></a>
## actual/forecast 차트와 표 규칙

주간 차트에서 완료된 actual 주차는 실선, 이후 forecast 주차는 점선으로 표시한다. 범례는 Actual 주차 수, Forecast 주차 수, 기준유가를 명시한다.

상세 표는 actual과 forecast의 첫 경계 앞에 `예측 시작` 행을 넣는다. 각 행은 순번, ISO 주 번호와 월, 기간, 상태, 가격, 기준유가 대비 차이·차이율·산출 방식을 표시한다. forecast 산출 방식은 주간 예측값, 월간 예측값, 직전 예측값 유지, 현재 적용유가 대체, 기준유가 대체로 구분한다. 데스크톱 표는 fallback 행에 `대체값 사용`과 source kind를 표시하지만, 현재 모바일 그룹에는 이 provenance가 표시되지 않는다. 모바일에서는 Actual 구간과 Forecast 구간만 별도 그룹으로 표시한다.

actual-first 판정과 forecast fallback 순서는 [아키텍처의 계산 규칙](architecture.md#actual-first-and-fallback)을 따른다.

<a id="date-time-and-formatting"></a>
## 날짜·시각과 수치 형식

대시보드 결과의 timezone은 `Asia/Seoul`이다. 날짜는 `YYYY.MM.DD`, 시각은 `YYYY.MM.DD HH:mm KST` 형식으로 표시한다. 주차 기간은 두 날짜를 `–`로 연결하고, 모바일에서는 연도를 생략한 짧은 형식을 사용한다.

가격은 한국어 로케일로 표시하고 기본 단위는 `원/L`이다. 기준 대비 가격 차이는 `원`, 비율은 백분율로 표시하며 양수에는 `+` 기호를 붙인다. 값이 없거나 숫자가 아니면 `기록 없음` 또는 각 패널의 데이터 부족 상태를 사용한다.

<a id="data-freshness-and-approval"></a>
## 상태 태그

freshness는 FSC 결과의 데이터 기준 시각에서 계산한다. `fresh`는 데이터 최신, `delayed`는 데이터 지연, `stale`은 데이터 오래됨, `unavailable`은 데이터 확인 필요로 표시한다.

승인 상태는 `approved`를 승인 완료, `rejected`를 반려, 그 밖의 `pending`을 승인 대기로 표시한다. 이 태그는 결과의 승인 상태를 표시할 뿐 승인 동작을 제공하지 않는다.

<a id="reliability-grades"></a>
## 신뢰도 등급

신뢰도는 현재 분기의 actual/forecast 주차 수가 아니라 forecast run metadata의 비교 가능한 완료 백테스트 표본으로 계산한다. 공식 등급에는 최근 13개 주간 백테스트의 MAPE만 사용하며 MAE와 bias는 참고 지표다.

- 표본이 0이면 `신뢰도 산정 전`으로 표시한다.
- 표본이 최소 표본 수 13보다 적거나 등급이 `U`, MAPE가 없으면 `신뢰도 산정 중 · 표본/13`으로 표시한다.
- 표본 13개 이상에서 MAPE 3% 이하는 A, 5% 이하는 B, 7.5% 이하는 C, 10% 이하는 D, 그 초과는 E다.
- A·B는 정상 톤, C는 경고 톤, D·E는 위험 톤을 사용한다.

<a id="public-market-factors"></a>
## 공개 시장 요인과 오피넷 참고값

시장 참고 패널은 FSC 주요 산출 결과보다 낮은 우선순위의 보조 정보다. 성공한 최신 recompute snapshot에 연결된 전국 평균 오피넷 현재 가격으로 최종 평균 경유가, 전일 대비 변화율, 수집 시각, 최신 주간·월간 평균, 커버리지를 표시한다. 최근 일별 가격은 최대 30개로 sparkline을 그리며 두 점 미만이면 데이터 부족으로 표시한다.

주요 시장 요인은 Dubai와 USD/KRW의 공개 일별 유효 관측값이다. 변화·비율·방향을 계산하려면 각 지표에 서로 다른 관측일의 최신값과 직전값이 모두 필요하며, 두 지표가 이 조건을 충족해야 시장 요인 상태가 준비됨이다. 하나라도 부족하면 `insufficient_data`, 확인 중인 지표가 있으면 `checking`으로 표시한다. 각 카드에는 값, 전일 대비 변화·비율·방향, 관측일, provider와 값 기준을 표시하며 FSC 산출 근거로 표현하지 않는다.

<a id="data-source-display-policy"></a>
## 데이터 출처 표시 정책

데이터 출처 표시는 오피넷, Dubai, USD/KRW별 관측일·수집 시각·freshness를 독립적으로 보여 준다. 대시보드의 현재 오피넷 가격은 public confirmed latest date가 있으면 그 날짜 이하의 행을 우선 표시하고, 해당 필터 결과가 비어 있으면 기존 행을 fallback으로 사용한다. 이 fallback은 confirmed cutoff 충족을 뜻하지 않으므로 관측일과 freshness를 반드시 확인해야 한다.

FSC 결과의 데이터 기준 시각은 source recompute snapshot의 current truth cutoff에서 유래한다. 원천·계산 관계와 immutable 결과 이력은 [아키텍처](architecture.md#current-truth-revision-snapshot)에 둔다.

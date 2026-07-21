# API 계약

모든 API route는 Node.js runtime과 dynamic 응답으로 구현된다. 아래 항목이 문서화된 HTTP API surface이며, `/admin/login`과 `/admin`은 UI 경로로 별도 구분한다.

<a id="admin-access-and-authentication"></a>
## 관리자 접근 및 인증

- `/admin/login`은 로그인 UI다. 이미 유효한 세션이 있으면 `/admin`으로 이동한다.
- `/admin`은 관리자 UI다. 유효한 관리자 세션이 없으면 `/admin/login`으로 이동한다.
- 로그인 성공 시 서명된 `fsc_admin_session` 쿠키가 발급된다. 쿠키는 `httpOnly`, `sameSite=strict`, 경로 `/`이며 production에서 `secure`다. 만료는 `ADMIN_SESSION_MAX_AGE_DAYS`를 사용한다.
- `ADMIN_SESSION_SECRET`을 변경하면 서명 검증이 달라져 기존 세션은 유효하지 않다. 인증 환경이 없거나 hash 형식이 잘못되면 로그인 API는 fail-closed로 503을 반환한다.
- 상태 변경 API는 유효한 세션, 요청 URL origin과 일치하는 `Origin` 또는 `Referer`, `application/json` content type을 모두 요구한다. JSON 파싱 실패는 400, content type 불일치는 415, 본문 제한 초과는 413이며 same-origin 위반은 403이다.

## 공통 응답 규칙

성공 응답은 `ok: true`와 `data`를 반환한다. handler 오류는 `ok: false`, `code`, `message` 및 해당 HTTP status를 반환한다. public FSC 조회에서 결과가 없으면 오류가 아니라 HTTP 200과 `{ ok: true, data: null, empty: true, code: "FSC_RESULT_NOT_FOUND", message: string }`를 반환한다. 성공 응답의 `message`는 route에 따라 있을 수 있고 없을 수 있다.

날짜·시각 필드는 `Date#toISOString()` 결과(UTC ISO 8601 문자열)다. 금액·비율 `Decimal`은 JSON 숫자가 아닌 고정 소수 자릿수 문자열이며, 달리 적지 않은 문자열·number·boolean 필드는 null이 아니다.

### 공통 DTO schema

- **QuarterSettingDto** (`GET /active-quarter`의 `data`, `GET /quarters`의 각 배열 원소): `id: string`, `targetYear: number`, `targetQuarter: number`, `referenceYear: number`, `referenceQuarter: number`, `quarterStartDate: ISO string`, `quarterEndDate: ISO string`, `basePriceKrwPerL: string(2)`, `appliedPriceKrwPerL: string(2)`, `fscLowRate: string(4)`, `fscHighRate: string(4)`, `status: string`, `isActive: boolean`, `createdAt: ISO string`, `updatedAt: ISO string`.
- **FscQuarterWeekDto** (`FscResultDto.weeks` 및 주차 route의 각 `weeks` 원소): `sequenceNo: number`, `targetMonth: number`, `weekNo: number`, `weekStartDate: ISO string`, `weekEndDate: ISO string`, `priceKind: string`, `priceKrwPerL: string(2)`, `actualPriceKrwPerL: string(2)|null`, `forecastPriceKrwPerL: string(2)|null`, `sourcePriceDate: ISO string|null`, `forecastSourceKind: string|null`, `fallbackUsed: boolean`, `basePriceKrwPerL: string(2)`, `priceDiffKrwPerL: string(2)`, `diffRatio: string(6)`.
- **FscResultDto** (`GET /current`, `GET /quarter`의 `data`): `id: string`, `scenarioName: string`, `quarter: { targetYear: number, targetQuarter: number, referenceYear: number, referenceQuarter: number, quarterStartDate: ISO string, quarterEndDate: ISO string }`, `calculationFormulaVersion: string`, `forecastModelVersion: string|null`, `basePriceKrwPerL: string(2)`, `appliedPriceKrwPerL: string(2)`, `quarterAverageKrwPerL: string(2)`, `priceDiffKrwPerL: string(2)`, `diffRatio: string(6)`, `fscLowRate: string(4)`, `fscHighRate: string(4)`, `fscLowKrwPerL: string(2)`, `fscHighKrwPerL: string(2)`, `actualWeekCount: number`, `forecastWeekCount: number`, `qualityMetrics`, `reliabilitySampleCount: number`, `reliabilityMinimumSampleCount: number`, `reliabilityGrade: string`, `dataFreshnessStatus: string`, `approvalStatus: string`, `approvedAt: ISO string|null`, `createdAt: ISO string`, `updatedAt: ISO string`, `dataBasisAt: ISO string|null`, `forecastCompletedAt: ISO string|null`, `weeks: FscQuarterWeekDto[]`.
- **`FscResultDto.qualityMetrics`**: `recent13wWeeklyPriceMae: string(2)|null`, `recent13wWeeklyPriceMape: string(6)|null`, `recent13wQuarterAveragePriceMae: string(2)|null`, `recent13wDirectionAccuracy: string(6)|null`, `recent4wWeeklyPriceMae: string(2)|null`, `recent4wErrorTrend: string|null`, `recent26wWeeklyPriceMae: string(2)|null`, `forecastBias4w: string(2)|null`, `forecastBias13w: string(2)|null`.
- **주차 조회 성공 `data`**는 `{ resultId: string, targetYear: number, targetQuarter: number, weeks: FscQuarterWeekDto[] }`다. 이 route는 결과 DTO를 재사용하지 않고 위 필드만 반환한다.

<a id="public-fsc-routes"></a>
## Public FSC routes

인증 없이 조회할 수 있다.

### `GET /api/fsc/active-quarter`

- **입력:** 없음.
- **성공:** 200, `QuarterSettingDto`를 `data`로 반환한다. 이 GET은 `ensureActiveQuarter()`를 호출한다. 설정이 전혀 없으면 초기 활성 분기를 생성하고, 활성 분기는 없지만 설정이 있으면 가장 최근 분기를 활성화하며, 만료된 분기는 close한 뒤 다음 분기를 생성하거나 활성화할 수 있다. 따라서 인증 없이 호출 가능하지만 read-only probe, crawler, retry에 안전한 조회가 아니며 운영 점검·모니터링에 이 route를 무분별하게 사용하면 안 된다.
- **오류:** 내부 조회 실패 시 500 `INTERNAL_ERROR`.

### `GET /api/fsc/quarters`

- **입력:** 없음.
- **성공:** 200, target year·quarter 내림차순의 `QuarterSettingDto[]`를 `data`로 반환한다. 먼저 `ensureActiveQuarter()`를 호출하므로 active-quarter route와 같은 생성·rollover side effect 및 운영 주의가 적용된다.
- **오류:** 내부 조회 실패 시 500 `INTERNAL_ERROR`.

### `GET /api/fsc/current`

- **입력:** 없음.
- **성공:** 200, active quarter의 최신 base `FscResultDto`를 `data`로 반환한다. 먼저 `ensureActiveQuarter()`를 호출하므로 active-quarter route와 같은 생성·활성화·rollover side effect 및 운영 주의가 적용된다.
- **empty:** 결과가 없으면 공통 empty-state 응답을 반환한다.
- **오류:** 내부 조회 실패 시 500 `INTERNAL_ERROR`.

### `GET /api/fsc/quarter`

- **query:** `year`, `quarter`를 함께 전달해야 한다. 현재 구현은 `Number.parseInt`로 숫자 prefix를 해석하며, `quarter`의 해석 결과는 유효한 분기 번호여야 한다.
- **성공:** 200, 지정 분기의 최신 base `FscResultDto`를 `data`로 반환한다.
- **empty:** 결과가 없으면 공통 empty-state 응답을 반환한다.
- **오류:** query 누락·한쪽만 전달·숫자로 해석할 수 없는 값·분기 번호 오류는 400 `INVALID_REQUEST`; 내부 조회 실패는 500 `INTERNAL_ERROR`.

### `GET /api/fsc/quarter/weeks`

- **query:** `year`, `quarter`는 함께 필수이며 현재 구현은 `Number.parseInt`로 숫자 prefix를 해석한다. 선택 `resultId`는 비어 있지 않은 문자열이어야 하며, 있으면 해당 결과를 조회한다.
- **성공:** 200, 공통 schema의 주차 조회 성공 `data`를 반환한다.
- **empty:** 결과가 없거나 `resultId` 결과의 연도·분기가 query와 다르면 공통 empty-state 응답을 반환한다.
- **오류:** 필수 query 누락·숫자로 해석할 수 없는 값·분기 번호·빈 `resultId` 오류는 400 `INVALID_REQUEST`; 내부 조회 실패는 500 `INTERNAL_ERROR`.

<a id="admin-and-state-changing-routes"></a>
## Admin 및 상태 변경 routes

아래 요청은 모두 JSON body를 사용한다. 로그인은 세션 대신 비밀번호 검증을 수행하고 same-origin·JSON 보호를 적용한다. logout은 same-origin·JSON 보호 후 쿠키를 삭제하며 세션 검사를 호출하지 않는다. FSC 변경 요청은 관리자 세션을 추가로 요구한다.

### `POST /api/admin/login`

- **body:** `{ "password": string }`.
- **성공:** 200, 세션 쿠키를 설정하고 `data: null`을 반환한다.
- **오류:** 빈/문자열이 아닌 비밀번호는 400 `INVALID_REQUEST`; 불일치는 401 `INVALID_CREDENTIALS`; same-origin·JSON·본문 오류는 공통 보호 status; 인증 환경 미구성은 503 `ADMIN_AUTH_NOT_CONFIGURED`; 기타는 500 `INTERNAL_ERROR`.

### `POST /api/admin/logout`

- **body:** 크기 제한 안의 유효한 JSON. 현재 runtime은 빈 객체 여부나 추가 필드를 검증하지 않고 body를 무시한다.
- **성공:** 200, 세션 쿠키를 삭제하고 `data: null`을 반환한다.
- **오류:** same-origin·JSON·본문 오류는 공통 보호 status; 그 밖의 오류는 500 `INTERNAL_ERROR`.

### `POST /api/fsc/recompute`

- **body:** 크기 제한 안의 유효한 JSON. 현재 runtime은 빈 객체 여부나 추가 필드를 검증하지 않고 body를 무시한다.
- **성공:** 200, `data: { resultId: string, targetYear: number, targetQuarter: number }`를 반환한다.
- **오류:** 세션 부재는 401 `UNAUTHORIZED`, same-origin 위반은 403 `FORBIDDEN`, JSON 보호 오류는 공통 보호 status, 재계산 실패는 500 `INTERNAL_ERROR`.

### `POST /api/fsc/approve`

- **body:** `{ "resultId": string }`; 공백만인 값은 허용하지 않는다.
- **성공:** 200, `data: { id: string, targetYear: number, targetQuarter: number, approvalStatus: string }`를 반환한다. 승인자는 `password-admin`으로 기록된다.
- **오류:** `resultId` 누락은 400 `INVALID_REQUEST`; 인증·same-origin·JSON 오류는 위 보호 계약; DB 처리 실패는 500 `INTERNAL_ERROR`.

### `POST /api/fsc/quarter/rollover`

- **body:** 선택 `{ "force": true }`; 다른 값은 force로 취급하지 않는다.
- **성공:** 200, `data: { targetYear: number, targetQuarter: number }`의 새 active quarter를 반환한다.
- **오류:** 종료되지 않은 active quarter를 `force: true` 없이 전환하면 409 `INVALID_REQUEST`; 인증·same-origin·JSON 오류는 위 보호 계약; 그 밖의 rollover 실패는 500 `INTERNAL_ERROR`.

### `POST /api/fsc/quarter/activate`

- **body:** `{ "year": integer, "quarter": integer }`.
- **성공:** 200, `data: { targetYear: number, targetQuarter: number }`의 활성화된 분기를 반환한다.
- **오류:** 존재하지 않는 quarter 또는 closed quarter는 409 `INVALID_REQUEST`; 인증·same-origin·JSON 오류는 위 보호 계약; 숫자 형식·분기 번호 등 기타 입력 처리 실패와 내부 실패는 500 `INTERNAL_ERROR`.

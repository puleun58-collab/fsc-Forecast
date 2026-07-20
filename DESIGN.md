# Fuel Operations Ledger

## Design Read

`fsc-forecast` is an operations decision dashboard, not a landing page. The interface should read like an aviation energy report crossed with a restrained financial terminal: precise numeric hierarchy, quiet surfaces, thin rules, and a clear actual-to-forecast boundary.

## Motion And Density

- DESIGN_VARIANCE: 4
- MOTION_INTENSITY: 2
- VISUAL_DENSITY: 6

Allowed motion is limited to hover background shifts, button press feedback, disclosure transitions, short chart tooltip transitions, and reduced-motion fallbacks.

## Core Hierarchy

1. Quarter average forecast fuel price
2. Difference amount and percent versus base price
3. FSC 30% and 70% derived outputs
4. Completed-month actual oil-price history
5. Actual / forecast weekly trend
6. Base price and applied price
7. Weekly detail data
8. Freshness, approval, reliability
9. Opinet market reference

FSC 30% and 70% values are derived from the quarter average forecast fuel price. They must remain in the same Decision Summary surface, not separate KPI cards.

## Tokens

```css
--canvas: #f2f1ec;
--surface: #fbfaf6;
--ink: #171a18;
--text-secondary: #676d69;
--border: #d8dad4;
--accent: #185a52;
--forecast-tint: #dce6e2;
--forecast-line: #70817b;
--warning: #a76018;
--critical: #a33b32;
```

Use one light theme. Do not introduce gradients, glass effects, dark sections, neon colors, decorative 3D assets, bento grids, marketing hero copy, or count-up animations.

## Oil Price History Primitive

`OilPriceHistory` is a full-width disclosure row placed directly after the Decision Summary surface and before the weekly trend. It must not alter the 7:5 desktop split, height, or internal layout of the existing summary surface.

- Collapsed: one compact row with the section title, completed-quarter averages, completed months from the latest incomplete quarter, year selector, and disclosure control.
- Expanded: horizontally scrollable quarter columns on desktop and a vertical quarter list on mobile.
- Data boundary: only published Opinet monthly actual averages are eligible. Forecast, fallback, mixed, and still-open monthly aggregates never enter this primitive.
- Quarter average: show only after all three monthly actual averages exist; calculate the simple arithmetic mean from the original-precision month values.
- Visual hierarchy: monthly values use body weight; completed-quarter averages use stronger type and a top rule. No status badges.
- Empty year: keep the row and controls visible and show `표시할 월평균 유가 데이터가 없습니다.`
- Accessibility: the disclosure button exposes `aria-expanded` and `aria-controls`; the year selector has a persistent accessible label.

## Signature Device

The single signature device is the Forecast boundary band.

- Chart: a pale vertical band and `예측 시작` label between the last actual point and first forecast point.
- Table: a stronger divider row above the first forecast row.
- Summary: Actual count uses solid-line language; Forecast count uses dashed-line language.
- Mobile: actual and forecast lists are separated by an explicit `예측 시작` header.

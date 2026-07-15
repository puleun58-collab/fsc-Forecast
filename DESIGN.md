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
4. Actual / forecast weekly trend
5. Base price and applied price
6. Weekly detail data
7. Freshness, approval, reliability
8. Opinet market reference

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

## Signature Device

The single signature device is the Forecast boundary band.

- Chart: a pale vertical band and `예측 시작` label between the last actual point and first forecast point.
- Table: a stronger divider row above the first forecast row.
- Summary: Actual count uses solid-line language; Forecast count uses dashed-line language.
- Mobile: actual and forecast lists are separated by an explicit `예측 시작` header.

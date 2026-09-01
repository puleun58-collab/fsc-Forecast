import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('app/globals.css', 'utf8');

test('forecast weeks keep the yellow distinction in desktop and mobile detail views', () => {
  assert.match(css, /--forecast-row:\s*#fbf7e8/);
  assert.match(
    css,
    /\.weekly-table__row--forecast\s*\{[^}]*background:\s*var\(--forecast-row\)/s,
  );
  assert.match(
    css,
    /\.weekly-mobile-item--forecast\s*\{[^}]*background:\s*var\(--forecast-row\)/s,
  );
});

test('week rows share one divider, month boundary, and hover rule across every quarter', () => {
  assert.match(css, /\.weekly-table__row\s*\{[^}]*border-top:\s*1px solid/s);
  assert.match(css, /\.weekly-table__row--month-start\s*\{[^}]*border-top:\s*2px solid/s);
  assert.match(css, /\.weekly-mobile-item--month-start\s*\{[^}]*border-top:\s*2px solid/s);
  assert.match(
    css,
    /\.weekly-table tbody tr:not\(\.weekly-table__boundary\):hover\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--surface-muted\)/s,
  );
  assert.match(css, /\.weekly-table__boundary td\s*\{[^}]*border-top:\s*2px solid var\(--forecast-boundary-line\)/s);
});

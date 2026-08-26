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

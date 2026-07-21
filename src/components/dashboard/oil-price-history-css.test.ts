import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('app/oil-price-history.css', 'utf8');

test('mobile year selector keeps enough inline space for the year suffix', () => {
  const mobileRule = css.match(
    /@media \(max-width: 480px\)[\s\S]*?\.oil-price-history__controls select \{([\s\S]*?)\}/,
  );

  assert.ok(mobileRule, 'mobile year selector rule must exist');
  assert.match(mobileRule[1], /min-inline-size:\s*96px/);
  assert.doesNotMatch(mobileRule[1], /max-width:\s*88px/);
});

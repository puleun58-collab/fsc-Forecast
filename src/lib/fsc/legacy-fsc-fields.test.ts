import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import test from 'node:test';

const APP_LAYER_DIRS = ['src', 'app', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);
const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage']);

// 70% 시나리오와 파생 가격값은 제거됐고, 유가 비중은 app 계층에서 oilWeightRate로만 부른다.
const FORBIDDEN_IDENTIFIERS = ['fscLowRate', 'fscHighRate', 'fscLowKrwPerL', 'fscHighKrwPerL'];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return IGNORED_DIRS.has(entry.name) ? [] : collectSourceFiles(entryPath);
    }

    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [entryPath] : [];
  });
}

test('app layer never reintroduces the removed FSC scenario fields', () => {
  const offenders = APP_LAYER_DIRS.flatMap((dir) => collectSourceFiles(dir))
    .filter((file) => !file.endsWith('legacy-fsc-fields.test.ts'))
    .flatMap((file) => {
      const contents = readFileSync(file, 'utf8');
      return FORBIDDEN_IDENTIFIERS.filter((identifier) => contents.includes(identifier)).map(
        (identifier) => `${file}: ${identifier}`,
      );
    });

  assert.deepEqual(offenders, []);
});

test('prisma keeps the oil weight rate mapped onto the original column', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const mappedFields = schema.match(/oilWeightRate\s+Decimal\s+@map\("fscLowRate"\)/g) ?? [];

  assert.equal(mappedFields.length, 2);
  assert.doesNotMatch(schema, /fscHighRate|fscLowKrwPerL|fscHighKrwPerL/);
});

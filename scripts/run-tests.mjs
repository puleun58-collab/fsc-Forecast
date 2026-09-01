// node --test 의 glob 지원은 Node 버전마다 다르므로 테스트 파일 목록을 직접 수집해 전달한다.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT_DIRS = ['src', 'app', 'scripts'];
const TEST_FILE_PATTERN = /\.test\.tsx?$/;
const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage']);

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return IGNORED_DIRS.has(entry.name) ? [] : collectTestFiles(entryPath);
    }

    return TEST_FILE_PATTERN.test(entry.name) ? [relative(process.cwd(), entryPath)] : [];
  });
}

const testFiles = ROOT_DIRS.flatMap((dir) => {
  try {
    return collectTestFiles(dir);
  } catch {
    return [];
  }
}).sort();

// 테스트는 실제 DB에 접속하지 않는다. env 모듈이 요구하는 값만 채우고 운영 .env는 읽지 않는다.
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/fsc_forecast_test?schema=public';

if (testFiles.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

console.log(`Running ${testFiles.length} test files with node:test.`);

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...(process.argv.slice(2)), ...testFiles],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);

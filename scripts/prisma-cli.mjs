// prisma CLI는 datasource url을 해석하려고 DATABASE_URL을 요구한다.
// 검증 명령(validate/generate)은 DB에 접속하지 않으므로 값이 없으면 더미로 채워 로컬·CI 어디서나 동작하게 한다.
import { spawnSync } from 'node:child_process';

process.env.DATABASE_URL ??= 'postgresql://check:check@127.0.0.1:5432/fsc_forecast_check?schema=public';

const result = spawnSync('npx', ['prisma', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);

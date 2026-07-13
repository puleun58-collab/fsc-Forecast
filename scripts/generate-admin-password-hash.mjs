#!/usr/bin/env node

import { randomBytes, scryptSync } from 'node:crypto';
import readline from 'node:readline';

function promptHidden(query) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error('TTY 환경에서만 비밀번호를 숨김 입력할 수 있습니다.'));
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const cleanup = () => {
      process.stdout.write('\n');
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      rl.close();
    };

    const onData = (chunk) => {
      const value = chunk.toString('utf8');

      if (value === '\u0003') {
        cleanup();
        reject(new Error('사용자가 입력을 취소했습니다.'));
      }
    };

    process.stdout.write(query);
    process.stdin.setRawMode(true);
    process.stdin.on('data', onData);

    rl.question('', (answer) => {
      cleanup();
      resolve(answer);
    });
  });
}

async function main() {
  const password = await promptHidden('관리자 비밀번호 입력: ');

  if (!password) {
    throw new Error('비밀번호를 비워둘 수 없습니다.');
  }

  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  const encoded = `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;

  process.stdout.write(`${encoded}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : '비밀번호 hash를 생성하지 못했습니다.'}\n`);
  process.exit(1);
});

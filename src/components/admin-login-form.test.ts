import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminLoginForm } from './admin-login-form';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('the login form keeps only the password field and submit action', () => {
  const markup = renderToStaticMarkup(createElement(AdminLoginForm));

  assert.match(markup, /관리자 비밀번호/);
  assert.match(markup, /placeholder="비밀번호 입력"/);
  assert.match(markup, /type="password"/);
  assert.match(markup, /autocomplete="current-password"/i);
  assert.match(markup, />로그인</);
  assert.doesNotMatch(markup, /quarter 운영|FSC 재계산|httpOnly|sameSite/);
});

test('the login screen renders as a narrow centered card', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  const page = readFileSync('app/admin/login/page.tsx', 'utf8');
  const route = readFileSync('app/api/admin/login/route.ts', 'utf8');

  assert.match(css, /\.admin-login\s*\{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.admin-login__card\s*\{[^}]*width:\s*min\(100%, 480px\)/s);
  assert.match(css, /\.admin-login \.button\s*\{[^}]*width:\s*100%/s);
  assert.match(page, /FSC Admin/);
  assert.match(page, /관리자 전용 로그인/);
  assert.match(page, /관리자 기능은 로그인 후 사용할 수 있습니다/);
  assert.doesNotMatch(
    page,
    /설정 확인됨|설정 필요|Authenticated admin|httpOnly|sameSite|ADMIN_SESSION_SECRET|ADMIN_SESSION_MAX_AGE_DAYS/,
  );
  assert.match(route, /message: '관리자 인증 설정을 확인해 주세요\.'/);
  assert.doesNotMatch(
    route,
    /code: 'ADMIN_AUTH_NOT_CONFIGURED',[\s\S]{0,120}message: error\.message/,
  );
});

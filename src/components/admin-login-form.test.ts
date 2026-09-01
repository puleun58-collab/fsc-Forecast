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

  assert.match(css, /\.admin-login\s*\{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.admin-login__card\s*\{[^}]*width:\s*min\(100%, 480px\)/s);
  assert.match(css, /\.admin-login \.button\s*\{[^}]*width:\s*100%/s);
  assert.match(page, /설정 확인됨/);
  assert.doesNotMatch(page, /Authenticated admin|ADMIN_SESSION_SECRET|ADMIN_SESSION_MAX_AGE_DAYS|httpOnly|sameSite/);
});

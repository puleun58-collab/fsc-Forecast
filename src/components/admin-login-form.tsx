'use client';

import { useId, useState } from 'react';

import { readActionResponseMessage } from './action-response';

export function AdminLoginForm() {
  const passwordHelpId = useId();
  const messageId = useId();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (pending) {
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        window.location.href = '/admin';
        return;
      }

      setMessage(await readActionResponseMessage(response, '로그인을 처리하지 못했습니다.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인을 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="form-stack">
      <label className="form-field">
        <span className="form-label">관리자 비밀번호</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          required
          disabled={pending}
          className="input"
          aria-describedby={[passwordHelpId, message ? messageId : null].filter(Boolean).join(' ')}
        />
        <span id={passwordHelpId} className="dashboard-shell__metric-caption">
          인증 후 quarter 운영과 FSC 재계산 기능이 열립니다.
        </span>
      </label>
      <div className="form-actions">
        <button type="submit" disabled={pending} className="button button--primary">
          {pending ? '검증 중...' : '로그인'}
        </button>
      </div>
      {message ? (
        <p id={messageId} className="form-message form-message--error" aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  );
}

'use client';

import { useState } from 'react';

type LoginResponse = {
  ok: boolean;
  message?: string;
};

export function AdminLoginForm() {
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

      const data = (await response.json().catch(() => null)) as LoginResponse | null;

      if (response.ok) {
        window.location.href = '/admin';
        return;
      }

      setMessage(data?.message ?? '로그인을 처리하지 못했습니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인을 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} style={{ display: 'grid', gap: 14 }}>
      <label style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontWeight: 700 }}>관리자 비밀번호</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          required
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'white',
            color: 'var(--text)',
          }}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'fit-content',
          padding: '10px 16px',
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: pending ? '#f4f6f8' : 'white',
          color: pending ? 'var(--text-muted)' : 'var(--text)',
          cursor: pending ? 'wait' : 'pointer',
          fontWeight: 700,
        }}
      >
        {pending ? '검증 중...' : '로그인'}
      </button>
      {message ? <p style={{ margin: 0, color: '#b42318' }}>{message}</p> : null}
    </form>
  );
}

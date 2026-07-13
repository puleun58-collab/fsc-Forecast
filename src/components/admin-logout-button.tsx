'use client';

import { useState } from 'react';

export function AdminLogoutButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleLogout(): Promise<void> {
    if (pending) {
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (response.ok) {
        window.location.href = '/admin/login';
        return;
      }

      setMessage(data?.message ?? '로그아웃을 처리하지 못했습니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그아웃을 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button"
        onClick={() => {
          void handleLogout();
        }}
        disabled={pending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'fit-content',
          padding: '10px 14px',
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: pending ? '#f4f6f8' : 'white',
          color: pending ? 'var(--text-muted)' : 'var(--text)',
          cursor: pending ? 'wait' : 'pointer',
          fontWeight: 700,
        }}
      >
        {pending ? '로그아웃 중...' : '로그아웃'}
      </button>
      {message ? <span style={{ color: '#b42318', fontSize: '0.84rem' }}>{message}</span> : null}
    </div>
  );
}

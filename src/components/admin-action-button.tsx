'use client';

import { useState } from 'react';

type AdminActionButtonProps = {
  label: string;
  endpoint: string;
  payload?: Record<string, unknown>;
  confirmMessage: string;
  reloadOnSuccess?: boolean;
};

export function AdminActionButton({
  label,
  endpoint,
  payload,
  confirmMessage,
  reloadOnSuccess = true,
}: AdminActionButtonProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    if (pending) {
      return;
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setPending(true);
    setMessage(null);

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload ?? {}),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : { message: await response.text() };
  const nextMessage = typeof data?.message === 'string' ? data.message : response.ok ? '처리되었습니다.' : '요청이 실패했습니다.';
  setMessage(nextMessage);

  if (response.status === 401) {
    window.location.href = '/admin/login';
    return;
  }

  if (response.ok && reloadOnSuccess) {
    window.location.reload();
  }
} catch (error) {
  setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
} finally {
  setPending(false);
}

  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button"
        onClick={() => {
          void handleClick();
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
        {pending ? '처리 중...' : label}
      </button>
      {message ? <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{message}</span> : null}
    </div>
  );
}

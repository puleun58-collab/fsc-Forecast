'use client';

import { useId, useState } from 'react';

import { readActionResponseMessage } from './action-response';

export function AdminLogoutButton() {
  const messageId = useId();
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

      if (response.ok) {
        window.location.href = '/admin/login';
        return;
      }

      setMessage(await readActionResponseMessage(response, '로그아웃을 처리하지 못했습니다.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그아웃을 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-action">
      <button
        type="button"
        onClick={() => {
          void handleLogout();
        }}
        disabled={pending}
        className="button button--secondary"
        aria-describedby={message ? messageId : undefined}
      >
        {pending ? '로그아웃 중...' : '로그아웃'}
      </button>
      {message ? (
        <span id={messageId} className="form-message form-message--error admin-action__message" aria-live="polite">
          {message}
        </span>
      ) : null}
    </div>
  );
}

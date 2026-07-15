'use client';

import { useId, useState } from 'react';

import { readActionResponseMessage } from './action-response';

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
  const messageId = useId();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    if (pending) {
      return;
    }

    if (!confirming) {
      setConfirming(true);
      setMessage(confirmMessage);
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

      const nextMessage = await readActionResponseMessage(
        response,
        response.ok ? '처리되었습니다.' : '요청이 실패했습니다.',
      );
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
      setConfirming(false);
    }
  }

  return (
    <div className="admin-action">
      <button
        type="button"
        onClick={() => {
          void handleClick();
        }}
        disabled={pending}
        className={confirming ? 'button button--primary' : 'button button--secondary'}
        aria-describedby={message ? messageId : undefined}
      >
        {pending ? '처리 중...' : confirming ? '계속 실행' : label}
      </button>
      {confirming ? (
        <button
          type="button"
          className="button button--quiet"
          onClick={() => {
            setConfirming(false);
            setMessage(null);
          }}
          disabled={pending}
        >
          취소
        </button>
      ) : null}
      {message ? (
        <span id={messageId} className="form-message admin-action__message" aria-live="polite">
          {message}
        </span>
      ) : null}
    </div>
  );
}

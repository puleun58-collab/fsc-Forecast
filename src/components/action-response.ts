function readMessageProperty(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('message' in value)) {
    return null;
  }

  const message = value.message;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

export async function readActionResponseMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const data: unknown = await response.json().catch(() => null);
    return readMessageProperty(data) ?? fallback;
  }

  const text = await response.text().catch(() => '');
  return text.trim().length > 0 ? text : fallback;
}

export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        'X-Undertone': '1',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(75_000)])
        : AbortSignal.timeout(75_000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      'Cannot reach your music server. Check that it is running and you are on the same network.',
    );
  }
  if (response.status === 204) return undefined as T;
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

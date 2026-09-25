export const configuredApiUrl = (import.meta.env.VITE_API_URL ?? '/api')
  .trim()
  .replace(/\/+$/, '');

export async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Máy chủ ${response.status}: ${detail}`);
  }

  return response.json();
}

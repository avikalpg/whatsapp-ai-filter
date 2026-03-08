/**
 * chat.ts
 * Calls the WACI backend proxy instead of Anthropic directly.
 * The backend holds the Anthropic API key; the app only stores a JWT.
 */

const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://whatsapp-ai-filter.vercel.app';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  error?: string;
  code?: string;
}

export async function callClaude(
  messages: Message[],
  authToken: string,
  serverUrl: string = DEFAULT_SERVER_URL,
  model = 'claude-3-5-haiku-latest',
  maxTokens = 1024
): Promise<string> {
  const res = await fetch(`${serverUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });

  const data: AnthropicResponse = await res.json();

  if (!res.ok) {
    // Use specific error codes so callers can show the right message
    if (res.status === 402) {
      throw new Error(data.code ?? 'TRIAL_EXPIRED'); // TRIAL_EXPIRED | TRIAL_BUDGET_EXHAUSTED
    }
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    throw new Error(data.error ?? `API error ${res.status}`);
  }

  const text = data.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('Empty response from Claude');
  return text;
}

/**
 * Register a new device. Returns JWT on success.
 * If device is already registered (409), calls reissueToken automatically.
 */
export async function registerDevice(
  deviceId: string,
  serverUrl: string = DEFAULT_SERVER_URL
): Promise<{ token: string }> {
  const res = await fetch(`${serverUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });

  if (res.status === 409) {
    // Already registered — re-issue token using device_id as credential
    return reissueToken(deviceId, serverUrl);
  }

  if (!res.ok) {
    throw new Error(`Registration failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Re-issue a JWT for an existing device.
 * Call when: 401 received (token expired) or app reinstalled (token lost).
 */
export async function reissueToken(
  deviceId: string,
  serverUrl: string = DEFAULT_SERVER_URL
): Promise<{ token: string }> {
  const res = await fetch(`${serverUrl}/api/auth/reissue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });

  if (!res.ok) {
    throw new Error(`Token reissue failed: ${res.status}`);
  }

  return res.json();
}

export async function activateTrial(
  authToken: string,
  serverUrl: string = DEFAULT_SERVER_URL
): Promise<{ trial_expires_at: string }> {
  const res = await fetch(`${serverUrl}/api/auth/activate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Activation failed: ${res.status}`);
  return res.json();
}

export async function saveCustomApiKey(
  apiKey: string,
  authToken: string,
  serverUrl: string = DEFAULT_SERVER_URL
): Promise<void> {
  const res = await fetch(`${serverUrl}/api/user/api-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ api_key: apiKey }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? 'Failed to save API key');
  }
}

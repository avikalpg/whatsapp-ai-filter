import { request } from './client';

export interface WhatsAppStatus {
  status: 'unlinked' | 'linking' | 'ready' | 'disconnected';
  phone_number: string | null;
  linked_at: string | null;
}

export interface Group {
  id: string;
  name: string;
}

export interface LinkStatusResponse {
  status: 'pending' | 'ready';
  token?: string;
  user?: { id: string; phone_number: string };
}

/** No token required — starts the WhatsApp pairing flow */
export function initLink(
  phone_number: string
): Promise<{ session_id: string; code: string; expires_in_seconds: number }> {
  return request('/api/whatsapp/init-link', { method: 'POST', body: { phone_number } });
}

/** Poll until status === 'ready', then extract token + user */
export function getLinkStatus(session_id: string): Promise<LinkStatusResponse> {
  return request<LinkStatusResponse>(`/api/whatsapp/link-status?session_id=${encodeURIComponent(session_id)}`);
}

export function getStatus(token: string): Promise<WhatsAppStatus> {
  return request<WhatsAppStatus>('/api/whatsapp/status', { token });
}

export function unlink(token: string): Promise<{ success: boolean }> {
  return request('/api/whatsapp/unlink', { method: 'DELETE', token });
}

export function getGroups(token: string): Promise<Group[]> {
  return request<Group[]>('/api/whatsapp/groups', { token });
}

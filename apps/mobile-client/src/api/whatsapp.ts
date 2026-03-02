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

export function getStatus(token: string): Promise<WhatsAppStatus> {
  return request<WhatsAppStatus>('/api/whatsapp/status', { token });
}

export function initLink(token: string, phone_number: string): Promise<{ code: string; expires_in_seconds: number }> {
  return request('/api/whatsapp/init-link', { method: 'POST', body: { phone_number }, token });
}

export function unlink(token: string): Promise<{ success: boolean }> {
  return request('/api/whatsapp/unlink', { method: 'DELETE', token });
}

export function getGroups(token: string): Promise<Group[]> {
  return request<Group[]>('/api/whatsapp/groups', { token });
}

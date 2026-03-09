import { request } from './client';

export interface FilterMatch {
  id: string;
  filter_id: string;
  filter_name: string;
  group_id: string | null;
  group_name: string | null;
  sender_name: string | null;
  content: string | null;
  is_dm: boolean;
  reasoning: string | null;
  confidence: number | null;
  original_timestamp: string | null;
  received_at: string;
  is_read: boolean;
}

export interface MessagesResponse {
  matches: FilterMatch[];
  next_cursor: string | null;
}

export function getMessages(
  token: string,
  params: { filter_id?: string; cursor?: string; limit?: number } = {}
): Promise<MessagesResponse> {
  const query = new URLSearchParams();
  if (params.filter_id) query.set('filter_id', params.filter_id);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request<MessagesResponse>(`/api/messages${qs ? `?${qs}` : ''}`, { token });
}

export function markRead(token: string, id: string): Promise<{ success: boolean }> {
  return request(`/api/messages/${id}/read`, { method: 'PATCH', token });
}

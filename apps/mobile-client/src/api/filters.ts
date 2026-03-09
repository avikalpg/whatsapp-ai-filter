import { request } from './client';

export interface GroupRule {
  group_id: string;
  group_name: string;
  rule_type: 'include' | 'exclude';
}

export interface Filter {
  id: string;
  name: string;
  prompt: string;
  category: 'personal' | 'work' | 'all';
  include_dms: boolean;
  is_active: boolean;
  is_preset: boolean;
  created_at: string;
  group_rules: GroupRule[];
}

export interface FilterInput {
  name: string;
  prompt: string;
  category?: 'personal' | 'work' | 'all';
  include_dms?: boolean;
  group_rules?: GroupRule[];
}

export function getFilters(token: string): Promise<Filter[]> {
  return request<Filter[]>('/api/filters', { token });
}

export function createFilter(token: string, data: FilterInput): Promise<Filter> {
  return request<Filter>('/api/filters', { method: 'POST', body: data, token });
}

export function updateFilter(
  token: string,
  id: string,
  data: Partial<FilterInput & { is_active: boolean }>
): Promise<Filter> {
  return request<Filter>(`/api/filters/${id}`, { method: 'PATCH', body: data, token });
}

export function deleteFilter(token: string, id: string): Promise<{ success: boolean }> {
  return request(`/api/filters/${id}`, { method: 'DELETE', token });
}

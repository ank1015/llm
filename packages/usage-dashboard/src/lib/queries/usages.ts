/**
 * Usage Queries
 *
 * TanStack Query hooks for fetching usage statistics.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { apiFetch } from '../api';

import type { Api } from '@ank1015/llm-types';
import type { UseQueryResult } from '@tanstack/react-query';

/** Token breakdown structure */
interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/** Cost breakdown structure */
interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/** Stats by API provider */
interface ApiStats {
  messages: number;
  tokens: TokenBreakdown;
  cost: CostBreakdown;
}

/** Stats by model */
interface ModelStats {
  api: string;
  modelName: string;
  messages: number;
  tokens: TokenBreakdown;
  cost: CostBreakdown;
}

/** Response from GET /usages/stats */
export interface UsageStatsResponse {
  totalMessages: number;
  tokens: TokenBreakdown;
  cost: CostBreakdown;
  byApi: Record<string, ApiStats>;
  byModel: Record<string, ModelStats>;
}

/** Message summary from GET /usages/messages */
export interface MessageSummary {
  id: string;
  api: string;
  modelId: string;
  modelName: string;
  timestamp: number;
  duration: number;
  stopReason: string;
  tokens: TokenBreakdown;
  cost: CostBreakdown;
}

/** Pagination info */
interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Response from GET /usages/messages */
export interface UsageMessagesResponse {
  messages: MessageSummary[];
  pagination: Pagination;
}

/** Filter options for usage queries */
export interface UsageFilterOptions {
  api?: Api;
  modelId?: string;
  startTime?: number;
  endTime?: number;
}

/** Pagination options for messages query */
export interface MessagesPaginationOptions {
  limit?: number;
  offset?: number;
}

/** Query keys for cache management */
export const usagesQueryKeys = {
  all: ['usages'] as const,
  stats: (filters?: UsageFilterOptions) => [...usagesQueryKeys.all, 'stats', filters] as const,
  messages: (filters?: UsageFilterOptions, pagination?: MessagesPaginationOptions) =>
    [...usagesQueryKeys.all, 'messages', filters, pagination] as const,
};

/**
 * Build query string from filter options.
 */
function buildQueryString(
  filters?: UsageFilterOptions,
  pagination?: MessagesPaginationOptions
): string {
  const params = new URLSearchParams();

  if (filters?.api) params.set('api', filters.api);
  if (filters?.modelId) params.set('modelId', filters.modelId);
  if (filters?.startTime) params.set('startTime', filters.startTime.toString());
  if (filters?.endTime) params.set('endTime', filters.endTime.toString());
  if (pagination?.limit) params.set('limit', pagination.limit.toString());
  if (pagination?.offset) params.set('offset', pagination.offset.toString());

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Hook to get aggregated usage statistics.
 */
export function useUsageStatsQuery(
  filters?: UsageFilterOptions
): UseQueryResult<UsageStatsResponse, Error> {
  return useQuery({
    queryKey: usagesQueryKeys.stats(filters),
    queryFn: () => apiFetch<UsageStatsResponse>(`/usages/stats${buildQueryString(filters)}`),
  });
}

/**
 * Hook to get paginated message summaries.
 */
export function useUsageMessagesQuery(
  filters?: UsageFilterOptions,
  pagination?: MessagesPaginationOptions
): UseQueryResult<UsageMessagesResponse, Error> {
  return useQuery({
    queryKey: usagesQueryKeys.messages(filters, pagination),
    queryFn: () =>
      apiFetch<UsageMessagesResponse>(`/usages/messages${buildQueryString(filters, pagination)}`),
    placeholderData: keepPreviousData,
  });
}

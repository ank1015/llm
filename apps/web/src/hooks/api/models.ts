"use client";

import { useQuery } from "@tanstack/react-query";

import { listModels } from "@/lib/client-api";
import { queryKeys } from "@/lib/query-keys";

export function useModelsQuery() {
  return useQuery({
    queryKey: queryKeys.models.list(),
    queryFn: listModels,
    staleTime: Infinity,
  });
}

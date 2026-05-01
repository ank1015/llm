'use client';

import { useQuery } from '@tanstack/react-query';

import { getDesktopFile, getDesktopListing } from '@/lib/client-api';
import { queryKeys } from '@/lib/query-keys';

export type UseDesktopListingInput = {
  path?: string;
  showHidden?: boolean;
};

export type UseDesktopFileInput = {
  path: string;
  maxBytes?: number;
};

export function useDesktopListingQuery(input?: UseDesktopListingInput) {
  return useQuery({
    queryKey: queryKeys.desktop.listing(input?.path, input?.showHidden),
    queryFn: () =>
      getDesktopListing({
        ...(input?.path !== undefined ? { path: input.path } : {}),
        ...(input?.showHidden !== undefined ? { showHidden: input.showHidden } : {}),
      }),
  });
}

export function useDesktopFileQuery(input: UseDesktopFileInput) {
  return useQuery({
    queryKey: queryKeys.desktop.file(input),
    queryFn: () => getDesktopFile(input),
  });
}

'use client';

import { useQuery } from '@tanstack/react-query';

import { getDesktopListing } from '@/lib/client-api';
import { queryKeys } from '@/lib/query-keys';

export type UseDesktopListingInput = {
  path?: string;
  showHidden?: boolean;
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

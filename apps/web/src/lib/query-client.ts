import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | null = null;

export function getBrowserQueryClient(): QueryClient {
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

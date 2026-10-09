import { QueryClient } from "@tanstack/react-query";

/** One QueryClient for the app. New features fetch through TanStack Query hooks. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

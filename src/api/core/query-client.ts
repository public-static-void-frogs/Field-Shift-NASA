import { QueryClient } from '@tanstack/react-query';
import { ApiUnavailableError } from './http.ts';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, error) => !(error instanceof ApiUnavailableError) && failureCount < 1,
      },
      mutations: { retry: false },
    },
  });
}

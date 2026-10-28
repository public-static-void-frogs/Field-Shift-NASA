import { QueryClient } from '@tanstack/react-query';
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1, networkMode: 'always' },
      // Mock requests are local and must also work offline. Use online mode for an HTTP transport.
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}

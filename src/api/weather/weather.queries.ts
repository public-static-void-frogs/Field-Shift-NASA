import { queryOptions } from '@tanstack/react-query';
import type { HistoryRange } from './weather.api.ts';
import { weatherApi } from './weather.api.ts';

export const weatherQueryKeys = {
  all: () => ['weather'] as const,
  current: () => ['weather', 'current'] as const,
  history: (range: HistoryRange) => ['weather', 'history', { range }] as const,
};
export const weatherQueries = {
  current: () =>
    queryOptions({
      queryKey: weatherQueryKeys.current(),
      queryFn: ({ signal }) => weatherApi.getCurrent(signal),
    }),
  history: (range: HistoryRange) =>
    queryOptions({
      queryKey: weatherQueryKeys.history(range),
      queryFn: ({ signal }) => weatherApi.getHistory(range, signal),
    }),
};

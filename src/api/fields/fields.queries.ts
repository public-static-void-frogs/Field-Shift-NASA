import { queryOptions } from '@tanstack/react-query';
import { fieldsApi } from './fields.api.ts';

export const fieldQueryKeys = {
  all: () => ['fields'] as const,
  list: () => [...fieldQueryKeys.all(), 'list'] as const,
  byId: (id: number) => [...fieldQueryKeys.all(), 'detail', id] as const,
  parcel: (id: number) => [...fieldQueryKeys.all(), 'parcel', id] as const,
  crops: () => [...fieldQueryKeys.all(), 'crops'] as const,
  properties: (id: number) => [...fieldQueryKeys.byId(id), 'properties'] as const,
  history: (id: number) => [...fieldQueryKeys.byId(id), 'history'] as const,
  recommendation: (id: number) => [...fieldQueryKeys.byId(id), 'recommendation'] as const,
};
export const fieldQueries = {
  list: () =>
    queryOptions({
      queryKey: fieldQueryKeys.list(),
      queryFn: ({ signal }) => fieldsApi.getAll(signal),
    }),
  byId: (id: number) =>
    queryOptions({
      queryKey: fieldQueryKeys.byId(id),
      queryFn: ({ signal }) => fieldsApi.getById(id, signal),
    }),
  parcel: (id: number) =>
    queryOptions({
      queryKey: fieldQueryKeys.parcel(id),
      queryFn: ({ signal }) => fieldsApi.getParcel(id, signal),
    }),
  crops: () =>
    queryOptions({
      queryKey: fieldQueryKeys.crops(),
      queryFn: ({ signal }) => fieldsApi.getCrops(signal),
    }),
  properties: (id: number) =>
    queryOptions({
      queryKey: fieldQueryKeys.properties(id),
      queryFn: ({ signal }) => fieldsApi.getProperties(id, signal),
    }),
  history: (id: number) =>
    queryOptions({
      queryKey: fieldQueryKeys.history(id),
      queryFn: ({ signal }) => fieldsApi.getHistory(id, signal),
    }),
  recommendation: (id: number) =>
    queryOptions({
      queryKey: fieldQueryKeys.recommendation(id),
      queryFn: ({ signal }) => fieldsApi.getRecommendation(id, signal),
    }),
};

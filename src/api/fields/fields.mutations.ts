import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { notificationQueryKeys } from '../notifications/notifications.queries.ts';
import { overviewQueryKeys } from '../overview/overview.queries.ts';
import { planningQueryKeys } from '../planning/planning.queries.ts';
import { fieldsApi } from './fields.api.ts';
import { fieldQueryKeys } from './fields.queries.ts';

export async function invalidateFieldData(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: fieldQueryKeys.all() }),
    client.invalidateQueries({ queryKey: notificationQueryKeys.all() }),
    client.invalidateQueries({ queryKey: planningQueryKeys.all() }),
    client.invalidateQueries({ queryKey: overviewQueryKeys.all() }),
  ]);
}
export const fieldMutations = {
  create: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ['fields', 'create'],
      mutationFn: fieldsApi.create,
      onSuccess: () => invalidateFieldData(client),
    }),
  remove: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ['fields', 'remove'],
      mutationFn: fieldsApi.remove,
      onSuccess: () => invalidateFieldData(client),
    }),
};

import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { farmQueryKeys } from '../farm/farm.queries.ts';
import { settingsApi } from './settings.api.ts';
import { settingsQueryKeys } from './settings.queries.ts';

export const settingsMutations = {
  update: (client: QueryClient) =>
    mutationOptions({
      mutationFn: settingsApi.update,
      onSuccess: async (settings) => {
        client.setQueryData(settingsQueryKeys.current(), settings);
        await client.invalidateQueries({ queryKey: farmQueryKeys.profile() });
      },
    }),
};

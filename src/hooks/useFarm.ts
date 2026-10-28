import { useMutation, useQueryClient, useSuspenseQueries } from '@tanstack/react-query';
import { farmQueries } from '../api/farm/farm.queries.ts';
import { fieldMutations } from '../api/fields/fields.mutations.ts';
import { fieldQueries } from '../api/fields/fields.queries.ts';
import { planningMutations } from '../api/planning/planning.mutations.ts';
import { planningQueries } from '../api/planning/planning.queries.ts';
import type { FarmData } from '../types/farm/farm.types.ts';
import type { EventDecision } from '../types/planning/planning.types.ts';

// Shared farm resources come from one cache; components never initialize fixture state.
export function useFarm(): FarmData {
  const client = useQueryClient();
  const [fields, profile, responses, planningContext] = useSuspenseQueries({
    queries: [
      fieldQueries.list(),
      farmQueries.profile(),
      planningQueries.responses(),
      planningQueries.context(),
    ],
  });
  const create = useMutation(fieldMutations.create(client));
  const remove = useMutation(fieldMutations.remove(client));
  const respond = useMutation(planningMutations.respondToStrategy(client));
  return {
    fields: fields.data,
    planningToday: planningContext.data.today,
    preferences: profile.data,
    eventResponses: responses.data,
    addField: create.mutateAsync,
    removeField: remove.mutateAsync,
    respondToStrategy: (fieldId: number, status: EventDecision) =>
      respond.mutateAsync({ fieldId, status }),
    isAddingField: create.isPending,
    isRemovingField: remove.isPending,
    isRespondingToStrategy: respond.isPending,
  };
}

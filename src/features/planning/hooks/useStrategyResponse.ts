import { useSuspenseQuery } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { planningQueries } from '../../../api/planning/planning.queries.ts';
import { useFarm } from '../../../hooks/useFarm.ts';
import type { EventDecision } from '../../../types/planning/planning.types.ts';
import { getStrategyDecision } from '../utils/eventPresentation.ts';

export function useStrategyResponse(fieldId: number) {
  const { t } = useTranslation();
  const { data: events } = useSuspenseQuery(planningQueries.fieldEvents(fieldId));
  const { fields, eventResponses, respondToStrategy, isRespondingToStrategy } = useFarm();
  const { message } = App.useApp();
  const field = fields.find((item) => item.id === fieldId);
  const decision = getStrategyDecision(events, eventResponses);
  function respond(status: EventDecision) {
    return respondToStrategy(fieldId, status).catch(() =>
      message.error(t('Unable to save changes')),
    );
  }

  return { field, events, decision, isRespondingToStrategy, respond };
}

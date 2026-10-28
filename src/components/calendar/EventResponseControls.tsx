import { useSuspenseQuery } from '@tanstack/react-query';
import { App, Button, Space, Tag } from 'antd';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { planningQueries } from '../../api/planning/planning.queries.ts';
import { useFarm } from '../../hooks/useFarm.ts';
import type { EventResponseControlsProps } from '../../types/planning/EventResponseControls.types.ts';
import { getEventDecision } from '../../utils/eventResponses.ts';

export function EventResponseControls({ fieldId }: EventResponseControlsProps) {
  const { t } = useTranslation();
  const { data: events } = useSuspenseQuery(planningQueries.fieldEvents(fieldId));
  const { fields, eventResponses, respondToStrategy, isRespondingToStrategy } = useFarm();
  const { message } = App.useApp();
  const field = fields.find((item) => item.id === fieldId);
  if (!field || !events.length) return null;

  const decision = events.every((event) => getEventDecision(event, eventResponses) === 'accepted')
    ? 'accepted'
    : events.every((event) => getEventDecision(event, eventResponses) === 'declined')
      ? 'declined'
      : 'proposed';
  return (
    <Space size={8} wrap className="event-response-controls">
      <Tag
        color={
          decision === 'accepted' ? 'success' : decision === 'declined' ? 'default' : 'processing'
        }
      >
        {decision === 'proposed'
          ? t('{{value0}} proposed events', { value0: events.length })
          : decision === 'accepted'
            ? t('All accepted')
            : t('All rejected')}
      </Tag>
      <Space.Compact>
        <Button
          size="small"
          type={decision === 'accepted' ? 'primary' : 'default'}
          icon={<Check size={15} />}
          aria-label={t('Accept all strategy events for {{value0}}', { value0: field.name })}
          aria-pressed={decision === 'accepted'}
          disabled={isRespondingToStrategy}
          onClick={(click) => {
            click.stopPropagation();
            void respondToStrategy(fieldId, 'accepted').catch(() =>
              message.error(t('Unable to save changes')),
            );
          }}
        >
          {t('Accept all')}
        </Button>
        <Button
          size="small"
          danger={decision === 'declined'}
          type={decision === 'declined' ? 'primary' : 'default'}
          icon={<X size={15} />}
          aria-label={t('Reject all strategy events for {{value0}}', { value0: field.name })}
          aria-pressed={decision === 'declined'}
          disabled={isRespondingToStrategy}
          onClick={(click) => {
            click.stopPropagation();
            void respondToStrategy(fieldId, 'declined').catch(() =>
              message.error(t('Unable to save changes')),
            );
          }}
        >
          {t('Reject all')}
        </Button>
      </Space.Compact>
    </Space>
  );
}

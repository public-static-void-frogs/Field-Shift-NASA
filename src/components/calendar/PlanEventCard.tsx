import { Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { categoryBackgrounds, categoryColors } from '../../features/planning/constants.ts';
import { useFarm } from '../../hooks/useFarm.ts';
import type { PlanEventCardProps } from '../../types/planning/PlanEventCard.types.ts';
import { getEventDecision } from '../../utils/eventResponses.ts';
import { getEventStatus } from '../../utils/planningDates.ts';
import { actionDetailsPath } from '../../utils/planningRoutes.ts';

export function PlanEventCard({ event, highlighted = false, onSelect }: PlanEventCardProps) {
  const { t } = useTranslation();
  const { eventResponses, planningToday } = useFarm();
  const decision = getEventDecision(event, eventResponses);
  return (
    <Card
      size="small"
      className={`plan-event-card ${highlighted ? 'plan-event-highlighted' : ''}`}
      style={
        {
          '--event-color': categoryColors[event.category],
          '--event-background': categoryBackgrounds[event.category],
        } as CSSProperties
      }
    >
      <Flex gap={8} wrap align="center" justify="space-between" className="plan-event-meta">
        <Typography.Text className="plan-event-category">{event.category}</Typography.Text>
        <Tag
          color={
            event.priority === 'High priority'
              ? 'error'
              : getEventStatus(event.date, planningToday) === 'Due soon'
                ? 'warning'
                : 'default'
          }
        >
          {event.priority === 'High priority'
            ? event.priority
            : t(getEventStatus(event.date, planningToday))}
        </Tag>
      </Flex>
      <Tag
        color={decision === 'accepted' ? 'success' : 'processing'}
        className="plan-event-response-tag"
      >
        {decision === 'accepted' ? t('Accepted') : t('Proposed')}
      </Tag>
      <Typography.Title level={5}>{event.title}</Typography.Title>
      <Typography.Text strong className="plan-event-field">
        {event.fieldName}
      </Typography.Text>
      <Flex align="center" justify="space-between" gap={8} className="plan-event-bottom">
        <Space size={6} className="compact-event-timing">
          <Clock3 size={14} />
          <Typography.Text type="secondary">{event.duration}</Typography.Text>
        </Space>
        <Button
          type="text"
          size="small"
          href={onSelect ? undefined : `#${actionDetailsPath(event)}`}
          onClick={onSelect}
          aria-label={t('View details: {{value0}} for {{value1}}', {
            value0: event.title,
            value1: event.fieldName,
          })}
        >
          {t('Details')} <ArrowUpRight size={15} />
        </Button>
      </Flex>
    </Card>
  );
}

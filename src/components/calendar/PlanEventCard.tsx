import type { CSSProperties } from 'react';
import { Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import { actionDetailsPath, categoryBackgrounds, categoryColors } from '../../data/planning';
import { getEventStatus } from '../../utils/planningDates';
import { useFarm } from '../../hooks/useFarm';
import { getEventDecision } from '../../utils/eventResponses';
import type { PlannedEvent } from '../../types/planning';

export function PlanEventCard({ event, highlighted = false, onSelect }: { event: PlannedEvent; highlighted?: boolean; onSelect?: () => void }) {
  const { eventResponses } = useFarm();
  const decision = getEventDecision(event, eventResponses);
  return (
    <Card
      size="small"
      className={`plan-event-card ${highlighted ? 'plan-event-highlighted' : ''}`}
      style={{ '--event-color': categoryColors[event.category], '--event-background': categoryBackgrounds[event.category] } as CSSProperties}
    >
      <Flex gap={8} wrap align="center" justify="space-between" className="plan-event-meta">
        <Typography.Text className="plan-event-category">{event.category}</Typography.Text>
        <Tag color={event.priority === 'High priority' ? 'error' : getEventStatus(event.date) === 'Due soon' ? 'warning' : 'default'}>
          {event.priority === 'High priority' ? event.priority : getEventStatus(event.date)}
        </Tag>
      </Flex>
      <Tag color={decision === 'accepted' ? 'success' : 'processing'} className="plan-event-response-tag">{decision === 'accepted' ? 'Accepted' : 'Proposed'}</Tag>
      <Typography.Title level={5}>{event.title}</Typography.Title>
      <Typography.Text strong className="plan-event-field">{event.fieldName}</Typography.Text>
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
          aria-label={`View details: ${event.title} for ${event.fieldName}`}
        >Details <ArrowUpRight size={15} /></Button>
      </Flex>
    </Card>
  );
}

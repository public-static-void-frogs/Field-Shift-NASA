import { Button, Card, Flex, Tag, Typography } from 'antd';
import { ArrowRight } from 'lucide-react';
import { actionDetailsPath, categoryColors } from '../../data/planning';
import { getEventStatus } from '../../utils/planningDates';
import type { PlannedEvent } from '../../types/planning';

export function PlanEventCard({ event, highlighted = false }: { event: PlannedEvent; highlighted?: boolean }) {
  return (
    <Card
      size="small"
      className={`plan-event-card ${highlighted ? 'plan-event-highlighted' : ''}`}
      style={{ borderInlineStartColor: categoryColors[event.category] }}
    >
      <Flex gap={8} wrap align="center">
        <Typography.Text strong>{event.fieldName}</Typography.Text>
        <Tag color={event.priority === 'High priority' ? 'error' : getEventStatus(event.date) === 'Due soon' ? 'warning' : 'default'}>
          {event.priority === 'High priority' ? event.priority : getEventStatus(event.date)}
        </Tag>
      </Flex>
      <Typography.Title level={5}>{event.title}</Typography.Title>
      <Typography.Text type="secondary" className="compact-event-timing">{event.duration}</Typography.Text>
      <Typography.Paragraph className="compact-event-description">{event.description}</Typography.Paragraph>
      <Button type="primary" block href={`#${actionDetailsPath(event)}`} icon={<ArrowRight size={17} />}>
        View action details
      </Button>
    </Card>
  );
}

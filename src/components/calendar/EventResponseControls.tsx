import { Button, Space, Tag } from 'antd';
import { Check, X } from 'lucide-react';
import { useFarm } from '../../hooks/useFarm';
import { getEventDecision } from '../../utils/eventResponses';
import { getFieldPlanEvents } from '../../data/planning';

export function EventResponseControls({ fieldId }: { fieldId: number }) {
  const { fields, eventResponses, respondToStrategy } = useFarm();
  const field = fields.find(item => item.id === fieldId);
  if (!field) return null;
  const events = getFieldPlanEvents(field);
  const decision = events.every(event => getEventDecision(event, eventResponses) === 'accepted') ? 'accepted'
    : events.every(event => getEventDecision(event, eventResponses) === 'declined') ? 'declined' : 'proposed';
  return <Space size={8} wrap className="event-response-controls">
    <Tag color={decision === 'accepted' ? 'success' : decision === 'declined' ? 'default' : 'processing'}>{decision === 'proposed' ? `${events.length} proposed events` : decision === 'accepted' ? 'All accepted' : 'All rejected'}</Tag>
    <Space.Compact>
      <Button
        size="small"
        type={decision === 'accepted' ? 'primary' : 'default'}
        icon={<Check size={15} />}
        aria-label={`Accept all strategy events for ${field.name}`}
        aria-pressed={decision === 'accepted'}
        onClick={click => { click.stopPropagation(); respondToStrategy(fieldId, 'accepted'); }}
      >Accept all</Button>
      <Button
        size="small"
        danger={decision === 'declined'}
        type={decision === 'declined' ? 'primary' : 'default'}
        icon={<X size={15} />}
        aria-label={`Reject all strategy events for ${field.name}`}
        aria-pressed={decision === 'declined'}
        onClick={click => { click.stopPropagation(); respondToStrategy(fieldId, 'declined'); }}
      >Reject all</Button>
    </Space.Compact>
  </Space>;
}

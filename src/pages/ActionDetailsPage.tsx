import { Button, Card, Col, Descriptions, Flex, Result, Row, Space, Tag, Typography } from 'antd';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import { EventResponseControls } from '../components/calendar/EventResponseControls';
import { PageHeading } from '../components/common/PageHeading';
import { calendarEventPath, getSystemPlanEvents } from '../data/planning';
import { useFarm } from '../hooks/useFarm';
import { formatPlanDate, getEventStatus } from '../utils/planningDates';

export function ActionDetailsPage({ eventId }: { eventId: string }) {
  const { fields } = useFarm();
  const event = getSystemPlanEvents(fields).find(item => item.id === eventId);
  const field = event && fields.find(item => item.id === event.fieldId);

  if (!event || !field) {
    return <Result status="404" title="Action not found" subTitle="This action is no longer in your field plan." extra={<Button type="primary" href="#/calendar">Open calendar</Button>} />;
  }

  const status = getEventStatus(event.date);
  return (
    <>
      <Button className="section-gap" href={`#${calendarEventPath(event)}`} icon={<ArrowLeft size={18} />}>Back to calendar</Button>
      <PageHeading
        eyebrow="SYSTEM ACTION PLAN"
        title={event.title}
        description={`${field.name} · ${formatPlanDate(event.date)}`}
        actions={<Button type="primary" href={`#/fields/${field.id}`} icon={<MapPin size={18} />}>View field</Button>}
      />
      <Row gutter={[24, 24]}>
        <Col xs={24} xl={15}>
          <Card title="Action overview" className="section-gap">
            <div className="event-response-panel"><Typography.Text strong>Field strategy · all proposed events</Typography.Text><EventResponseControls fieldId={event.fieldId} /></div>
            <Flex gap={10} wrap className="section-gap">
              <Tag>{event.category}</Tag>
              <Tag color={event.priority === 'High priority' ? 'error' : event.priority === 'Important' ? 'warning' : 'default'}>{event.priority}</Tag>
              <Tag color={status === 'Due soon' ? 'warning' : 'success'}>{status}</Tag>
            </Flex>
            <Typography.Paragraph>{event.description}</Typography.Paragraph>
            <Descriptions column={1} items={[
              { key: 'date', label: 'Scheduled date', children: <a href={`#${calendarEventPath(event)}`}><Space><CalendarDays size={18} />{formatPlanDate(event.date)}</Space></a> },
              { key: 'duration', label: 'Time required', children: event.duration },
              { key: 'field', label: 'Field', children: `${field.name} · ${field.area} ha` },
              { key: 'owner', label: 'Plan maintained by', children: 'System' },
            ]} />
          </Card>
          <Card title="Why this action is scheduled">
            <Typography.Paragraph className="no-margin">{event.rationale}</Typography.Paragraph>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="Current field conditions">
            <Descriptions column={1} items={[
              { key: 'crop', label: 'Current crop', children: field.crop },
              { key: 'health', label: 'Field health', children: `${field.health}%` },
              { key: 'moisture', label: 'Soil moisture', children: `${field.moisture}%` },
              { key: 'nitrogen', label: 'Nitrogen', children: `${field.nitrogen} mg/kg` },
              { key: 'status', label: 'Condition', children: field.status },
            ]} />
          </Card>
        </Col>
      </Row>
    </>
  );
}

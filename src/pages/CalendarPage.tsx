import { useState } from 'react';
import { Button, Card, Empty, Flex, Input, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { CalendarDays, LockKeyhole, Search } from 'lucide-react';
import { PageHeading } from '../components/common/PageHeading';
import { PlanEventCard } from '../components/calendar/PlanEventCard';
import { SystemCalendar } from '../components/calendar/SystemCalendar';
import { actionDetailsPath, calendarPath, getSystemPlanEvents, planCategories } from '../data/planning';
import { useFarm } from '../hooks/useFarm';
import type { PlannedEvent } from '../types/planning';
import type { Navigate } from '../types/navigation';
import { formatPlanDate, getEventStatus, isPlanDate, planningToday } from '../utils/planningDates';

interface CalendarPageProps {
  navigate: Navigate;
  date?: string;
  fieldId?: number;
  eventId?: string;
}
export function CalendarPage({ navigate, date, fieldId, eventId }: CalendarPageProps) {
  const { fields } = useFarm();
  const [category, setCategory] = useState('All actions');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('calendar');
  const [calendarMode, setCalendarMode] = useState<'month' | 'year'>('month');
  const selectedDate = isPlanDate(date) ? date! : planningToday;
  const events = getSystemPlanEvents(fields);
  const visible = events.filter(event => (
    (!fieldId || event.fieldId === fieldId) &&
    (category === 'All actions' || event.category === category) &&
    `${event.title} ${event.fieldName} ${event.description}`.toLowerCase().includes(query.toLowerCase())
  ));
  const selectedEvents = visible.filter(event => event.date === selectedDate);
  const monthEvents = visible.filter(event => event.date.startsWith(selectedDate.slice(0, 7)));
  const upcoming = visible.filter(event => event.date >= planningToday);
  const nextEvent = upcoming[0];
  const dayAgenda = (
    <aside className="calendar-day-panel" aria-labelledby="calendar-day-heading">
      <Flex justify="space-between" align="center" gap={10} wrap className="calendar-day-panel-heading">
        <Typography.Title level={4} id="calendar-day-heading" className="no-margin">{formatPlanDate(selectedDate)}</Typography.Title>
        <Tag>{`${selectedEvents.length} ${selectedEvents.length === 1 ? 'action' : 'actions'}`}</Tag>
      </Flex>
      <Typography.Paragraph type="secondary" className="calendar-day-panel-caption">System-planned actions for this date</Typography.Paragraph>
      {selectedEvents.length ? (
        <div className="calendar-day-events">{selectedEvents.map(event => <PlanEventCard key={event.id} event={event} highlighted={event.id === eventId} />)}</div>
      ) : (
        <Card size="small"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No actions for this date.">{nextEvent && <Button onClick={() => openEvent(nextEvent)}>View next action</Button>}</Empty></Card>
      )}
    </aside>
  );
  function openEvent(event: PlannedEvent) {
    setTab('calendar');
    setCalendarMode('month');
    navigate(calendarPath(event.date, fieldId, event.id));
  }
  const columns: TableColumnsType<PlannedEvent> = [
    {
      title: 'Date',
      dataIndex: 'date',
      width: 185,
      render: (value: string, event) => (
        <Button type="link" onClick={() => openEvent(event)}>
          {formatPlanDate(value)}
        </Button>
      ),
    },
    {
      title: 'Field',
      dataIndex: 'fieldName',
      width: 180,

    },
    {
      title: 'Planned action',
      dataIndex: 'title',
      width: 400,
      render: (value: string, event) => (
        <div>
          <Typography.Text strong>
            {value}
          </Typography.Text>
          <Typography.Paragraph type="secondary" className="agenda-event-description">
            {event.description}
          </Typography.Paragraph>
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'category',
      width: 160,
      render: (value: string) => (
        <Tag>
          {value}
        </Tag>
      )
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: 160,
      render: (value: string) => (
        <Tag color={value === 'High priority' ? 'error' : value === 'Important' ? 'warning' : 'default'}>
          {value}
        </Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'date',
      key: 'status',
      width: 140,
      render: (value: string) => (
        <Tag color={getEventStatus(value) === 'Due soon' ? 'warning' : 'success'}>
          {getEventStatus(value)}
        </Tag>
      )
    },
    {
      title: 'Details',
      key: 'details',
      width: 160,
      render: (_, event) => <Button type="primary" href={`#${actionDetailsPath(event)}`}>View details</Button>,
    },
  ];
  return (
    <>
      <PageHeading
        title="Your next season starts here."
        description="Crop rotations and field action plans, scheduled and maintained by the system."
        eyebrow="FARM CALENDAR"
        actions={<Tag icon={<LockKeyhole size={16} />}>System maintained</Tag>}
      />
      <Card className="calendar-summary-card">
        <div className="calendar-summary">
          <Statistic title="Scheduled actions" value={visible.length} />
          <Statistic title="Predicted rotations" value={visible.filter(event => event.category === 'Crop rotation').length} />
          <Statistic title="Due in the next 7 days" value={visible.filter(event => getEventStatus(event.date) === 'Due soon').length} />
        </div>
        <Typography.Text type="secondary" className="calendar-summary-caption">{`System planning date · ${formatPlanDate(planningToday)}`}</Typography.Text>
      </Card>
      <Card
        className="calendar-workspace"
        title={<Space>
          <CalendarDays size={23} />
          System calendar
        </Space>}
        extra={<Tag>
          {`${monthEvents.length} ${monthEvents.length === 1 ? 'action' : 'actions'} in ${dayjs(selectedDate).format('MMMM YYYY')}`}
        </Tag>}
      >
        <Flex
          className="calendar-filters"
          gap={12}
          wrap
          align="center"
        >
          <Select
            aria-label="Filter calendar by field"
            value={fieldId ? String(fieldId) : 'all'}
            onChange={value => navigate(calendarPath(selectedDate, value === 'all' ? undefined : Number(value)))}
            options={[
              { value: 'all', label: 'All fields' },
              ...fields.map(field => ({ value: String(field.id), label: field.name }))
            ]}
          />
          <Select
            aria-label="Filter calendar by action"
            value={category}
            onChange={setCategory}
            options={['All actions', ...planCategories].map(value => ({ value, label: value }))}
          />
          <Input
            aria-label="Search scheduled actions"
            prefix={<Search size={18} />}
            placeholder="Search planned actions…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            allowClear
          />
          <Button
            onClick={() => {
              setCategory('All actions');
              setQuery('');
              setTab('calendar');
              setCalendarMode('month');
              navigate(calendarPath(planningToday));
            }}
          >Reset view</Button>
        </Flex>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'calendar',
              label: 'Calendar',
              children: (
                <div className="calendar-content-grid">
                  <SystemCalendar
                    mode={calendarMode}
                    onModeChange={setCalendarMode}
                    value={dayjs(selectedDate)}
                    events={visible}
                    onDateSelect={value => navigate(calendarPath(value, fieldId))}
                    onEventSelect={openEvent}
                  />
                  {dayAgenda}
                </div>
              ),
            },
            {
              key: 'agenda',
              label: 'All planned actions',
              children: <Table<PlannedEvent>
                rowKey="id"
                columns={columns}
                dataSource={visible}
                scroll={{ x: 1400 }}
                pagination={{ pageSize: 8, showSizeChanger: false }}
                locale={{ emptyText: <Empty description="No planned actions match these filters." /> }}
              />,
            },
          ]}
        />
      </Card>

    </>
  );
}

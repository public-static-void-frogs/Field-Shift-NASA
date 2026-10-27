import { useState } from 'react';
import { Button, Descriptions, Drawer, Empty, Flex, Input, Segmented, Select, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { Search } from 'lucide-react';
import { PlanEventCard } from '../components/calendar/PlanEventCard';
import { SystemCalendar } from '../components/calendar/SystemCalendar';
import { calendarPath, getSystemPlanEvents, planCategories } from '../data/planning';
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
  const [dayOpen, setDayOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'month' | 'year'>('month');
  const selectedDate = isPlanDate(date) ? date! : planningToday;
  const events = getSystemPlanEvents(fields);
  const visible = events.filter(event => (
    (!fieldId || event.fieldId === fieldId) &&
    (category === 'All actions' || event.category === category) &&
    `${event.title} ${event.fieldName} ${event.description}`.toLowerCase().includes(query.toLowerCase())
  ));
  const selectedEvents = visible.filter(event => event.date === selectedDate);
  const selectedEvent = events.find(event => event.id === eventId);
  const selectedField = fields.find(field => field.id === selectedEvent?.fieldId);

  function openEvent(event: PlannedEvent) {
    setDayOpen(false);
    navigate(calendarPath(event.date, fieldId, event.id));
  }
  function closeDrawer() {
    setDayOpen(false);
    navigate(calendarPath(selectedDate, fieldId));
  }

  const columns: TableColumnsType<PlannedEvent> = [
    { title: 'Date', dataIndex: 'date', width: 180, render: (value: string) => formatPlanDate(value) },
    { title: 'Field', dataIndex: 'fieldName', width: 180 },
    { title: 'Planned action', dataIndex: 'title', render: (value: string, event) => <Button type="link" onClick={() => openEvent(event)}>{value}</Button> },
    { title: 'Type', dataIndex: 'category', render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Status', dataIndex: 'date', render: (value: string) => <Tag>{getEventStatus(value)}</Tag> },
  ];

  return (
    <div className="calendar-fullscreen">
      <Flex className="calendar-toolbar" gap={10} align="center" wrap>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'calendar', label: 'Calendar' }, { value: 'agenda', label: 'All actions' }]} />
        <Select
          aria-label="Filter calendar by field"
          value={fieldId ? String(fieldId) : 'all'}
          onChange={value => navigate(calendarPath(selectedDate, value === 'all' ? undefined : Number(value)))}
          options={[{ value: 'all', label: 'All fields' }, ...fields.map(field => ({ value: String(field.id), label: field.name }))]}
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
          placeholder="Search actions…"
          value={query}
          onChange={event => setQuery(event.target.value)}
          allowClear
        />
        <Button onClick={() => {
          setCategory('All actions');
          setQuery('');
          setCalendarMode('month');
          setDayOpen(false);
          navigate(calendarPath(planningToday));
        }}>Reset view</Button>
      </Flex>
      <div className="calendar-main">
        {tab === 'calendar' ? <SystemCalendar
          mode={calendarMode}
          onModeChange={setCalendarMode}
          value={dayjs(selectedDate)}
          events={visible}
          onDateSelect={value => {
            navigate(calendarPath(value, fieldId));
            setDayOpen(true);
          }}
          onPanelDateChange={value => navigate(calendarPath(value, fieldId))}
          onEventSelect={openEvent}
        /> : <Table<PlannedEvent>
          rowKey="id"
          columns={columns}
          dataSource={visible}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          onRow={event => ({ onClick: () => openEvent(event), className: 'clickable-row' })}
          locale={{ emptyText: <Empty description="No planned actions match these filters." /> }}
        />}
      </div>
      <Drawer
        title={selectedEvent ? 'Action details' : formatPlanDate(selectedDate)}
        placement="right"
        open={Boolean(eventId) || dayOpen}
        onClose={closeDrawer}
        styles={{ wrapper: { width: 'min(480px, 100vw)' } }}
        footer={selectedEvent && <Button type="primary" block onClick={() => navigate(`/fields/${selectedEvent.fieldId}`)}>View field</Button>}
      >
        {selectedEvent ? <>
          <Flex gap={8} wrap className="section-gap">
            <Tag>{selectedEvent.category}</Tag>
            <Tag color={selectedEvent.priority === 'High priority' ? 'error' : selectedEvent.priority === 'Important' ? 'warning' : 'default'}>{selectedEvent.priority}</Tag>
            <Tag>{getEventStatus(selectedEvent.date)}</Tag>
          </Flex>
          <Typography.Title level={3}>{selectedEvent.title}</Typography.Title>
          <Typography.Paragraph>{selectedEvent.description}</Typography.Paragraph>
          <Descriptions column={1} items={[
            { key: 'date', label: 'Scheduled date', children: formatPlanDate(selectedEvent.date) },
            { key: 'field', label: 'Field', children: selectedEvent.fieldName },
            { key: 'duration', label: 'Time required', children: selectedEvent.duration },
            { key: 'owner', label: 'Maintained by', children: 'System' },
          ]} />
          <Typography.Title level={5}>Why this action is scheduled</Typography.Title>
          <Typography.Paragraph>{selectedEvent.rationale}</Typography.Paragraph>
          {selectedField && <>
            <Typography.Title level={5}>Current field conditions</Typography.Title>
            <Descriptions column={1} items={[
              { key: 'crop', label: 'Crop', children: selectedField.crop },
              { key: 'area', label: 'Area', children: `${selectedField.area} ha` },
              { key: 'health', label: 'Crop health', children: `${selectedField.health}%` },
              { key: 'moisture', label: 'Soil moisture', children: `${selectedField.moisture}%` },
              { key: 'nitrogen', label: 'Nitrogen', children: `${selectedField.nitrogen} mg/kg` },
              { key: 'status', label: 'Condition', children: selectedField.status },
            ]} />
          </>}
        </> : eventId ? <Empty description="This action is no longer in your field plan." /> : selectedEvents.length ? (
          <div className="calendar-drawer-events">{selectedEvents.map(event => <PlanEventCard key={event.id} event={event} onSelect={() => openEvent(event)} />)}</div>
        ) : <Empty description="No actions for this date." />}
      </Drawer>
    </div>
  );
}

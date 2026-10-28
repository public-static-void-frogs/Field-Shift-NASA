import type { TableColumnsType } from 'antd';
import { Button, Drawer, Empty, Flex, Input, Segmented, Select, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CalendarDrawerContent } from '../features/planning/components/CalendarDrawerContent.tsx';
import { SystemCalendar } from '../features/planning/components/SystemCalendar';
import { RouterButton } from '../components/common/RouterButton';
import { planCategories } from '../features/planning/constants/planning.constants.ts';
import { useCalendarPage } from '../features/planning/hooks/useCalendarPage.ts';
import { getEventDecision } from '../features/planning/utils/eventResponses.ts';
import { formatPlanDate } from '../features/planning/utils/planningDates.ts';
import type { PlannedEvent } from '../types/planning/planning.types.ts';

export function CalendarPage() {
  const {
    fieldId,
    eventId,
    changeField,
    changeDate,
    selectDate,
    resetView,
    fields,
    eventResponses,
    planningToday,
    category,
    setCategory,
    query,
    setQuery,
    tab,
    setTab,
    dayOpen,
    calendarMode,
    setCalendarMode,
    selectedDate,
    visible,
    selectedEvents,
    selectedEvent,
    selectedField,
    openEvent,
    closeDrawer,
  } = useCalendarPage();
  const { t } = useTranslation();
  const columns: TableColumnsType<PlannedEvent> = [
    {
      title: t('Date'),
      dataIndex: 'date',
      width: 180,
      render: (value: string) => formatPlanDate(value),
    },
    { title: t('Field'), dataIndex: 'fieldName', width: 180 },
    {
      title: t('Planned action'),
      dataIndex: 'title',
      render: (value: string, event) => (
        <Button type="link" onClick={() => openEvent(event)}>
          {value}
        </Button>
      ),
    },
    { title: t('Type'), dataIndex: 'category', render: (value: string) => <Tag>{value}</Tag> },
    {
      title: t('Status'),
      key: 'response',
      render: (_, event) => (
        <Tag
          color={getEventDecision(event, eventResponses) === 'accepted' ? 'success' : 'processing'}
        >
          {getEventDecision(event, eventResponses) === 'accepted' ? t('Accepted') : t('Proposed')}
        </Tag>
      ),
    },
  ];

  return (
    <div className="calendar-fullscreen">
      <Flex className="calendar-toolbar" gap={10} align="center" wrap>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'calendar', label: t('Calendar') },
            { value: 'agenda', label: t('All actions') },
          ]}
        />
        <Select
          aria-label={t('Filter calendar by field')}
          value={fieldId ? String(fieldId) : 'all'}
          onChange={changeField}
          options={[
            { value: 'all', label: t('All fields') },
            ...fields.map((field) => ({ value: String(field.id), label: field.name })),
          ]}
        />
        <Select
          aria-label={t('Filter calendar by action')}
          value={category}
          onChange={setCategory}
          options={['All actions', ...planCategories].map((value) => ({ value, label: t(value) }))}
        />
        <Input
          aria-label={t('Search scheduled actions')}
          prefix={<Search size={18} />}
          placeholder={t('Search actions…')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
        <Button onClick={resetView}>{t('Reset view')}</Button>
      </Flex>
      <div className="calendar-main">
        {tab === 'calendar' ? (
          <SystemCalendar
            mode={calendarMode}
            onModeChange={setCalendarMode}
            value={dayjs(selectedDate)}
            events={visible}
            onDateSelect={selectDate}
            onPanelDateChange={changeDate}
            onEventSelect={openEvent}
          />
        ) : (
          <Table<PlannedEvent>
            rowKey="id"
            columns={columns}
            dataSource={visible}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            onRow={(event) => ({
              onClick: (click) => {
                if (!(click.target as HTMLElement).closest('a, button')) {
                  openEvent(event);
                }
              },
              className: 'clickable-row',
            })}
            locale={{
              emptyText: <Empty description={t('No planned actions match these filters.')} />,
            }}
          />
        )}
      </div>
      <Drawer
        title={selectedEvent ? t('Action details') : formatPlanDate(selectedDate)}
        placement="right"
        open={Boolean(eventId) || dayOpen}
        onClose={closeDrawer}
        styles={{ wrapper: { width: 'min(480px, 100vw)' } }}
        footer={
          selectedEvent && (
            <Flex gap={8}>
              <RouterButton type="primary" to={`/fields/${selectedEvent.fieldId}`}>
                {t('View field')}
              </RouterButton>
              <RouterButton to={`/fields/${selectedEvent.fieldId}/strategy`}>
                {t('View strategy')}
              </RouterButton>
            </Flex>
          )
        }
      >
        <CalendarDrawerContent
          selectedEvent={selectedEvent}
          selectedField={selectedField}
          eventId={eventId}
          selectedEvents={selectedEvents}
          planningToday={planningToday}
          openEvent={openEvent}
        />
      </Drawer>
    </div>
  );
}

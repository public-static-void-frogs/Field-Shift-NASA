import { useSuspenseQuery } from '@tanstack/react-query';
import { Calendar } from 'antd';
import { planningQueries } from '../../../api/planning/planning.queries.ts';
import type { SystemCalendarProps } from '../../../types/planning/SystemCalendar.types.ts';
import { useSystemCalendar } from '../hooks/useSystemCalendar.ts';
import { CalendarCell } from './CalendarCell.tsx';

export function SystemCalendar({
  value,
  events,
  onDateSelect,
  onEventSelect,
  mode,
  onModeChange,
  onPanelDateChange,
}: SystemCalendarProps) {
  const { compact, selectDate, changePanel } = useSystemCalendar({
    onDateSelect,
    onModeChange,
    onPanelDateChange,
  });
  const { data: eventResponses } = useSuspenseQuery(planningQueries.responses());

  return (
    <Calendar
      className={`system-calendar ${compact ? 'system-calendar-compact' : ''}`}
      fullscreen
      value={value}
      mode={mode}
      cellRender={(date, info) => (
        <CalendarCell
          date={date}
          info={info}
          events={events}
          compact={compact}
          eventResponses={eventResponses}
          onDateSelect={onDateSelect}
          onEventSelect={onEventSelect}
        />
      )}
      onSelect={selectDate}
      onPanelChange={changePanel}
    />
  );
}

import { Calendar } from 'antd';
import { useSystemCalendar } from '../hooks/useSystemCalendar.ts';
import { useFarm } from '../../../hooks/useFarm.ts';
import type { SystemCalendarProps } from '../../../types/planning/SystemCalendar.types.ts';
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
  const { eventResponses } = useFarm();

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

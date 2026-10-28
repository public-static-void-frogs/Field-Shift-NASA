import type { CalendarProps } from 'antd';
import type { Dayjs } from 'dayjs';
import type { CalendarMode, EventResponses, PlannedEvent } from './planning.types.ts';

export interface SystemCalendarProps {
  value: Dayjs;
  events: PlannedEvent[];
  onDateSelect: (date: string) => void;
  onPanelDateChange: (date: string) => void;
  onEventSelect: (event: PlannedEvent) => void;
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
}

export interface CalendarCellProps extends Pick<
  SystemCalendarProps,
  'events' | 'onDateSelect' | 'onEventSelect'
> {
  date: Dayjs;
  info: Parameters<NonNullable<CalendarProps<Dayjs>['cellRender']>>[1];
  compact: boolean;
  eventResponses: EventResponses;
}

import type { Dayjs } from 'dayjs';
import type { CalendarMode, PlannedEvent } from './planning.types.ts';

export interface SystemCalendarProps {
  value: Dayjs;
  events: PlannedEvent[];
  onDateSelect: (date: string) => void;
  onPanelDateChange: (date: string) => void;
  onEventSelect: (event: PlannedEvent) => void;
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
}

import type { CalendarProps } from 'antd';
import { Grid } from 'antd';
import type { Dayjs } from 'dayjs';
import type { SystemCalendarProps } from '../../../types/planning/SystemCalendar.types.ts';

export function useSystemCalendar({
  onDateSelect,
  onModeChange,
  onPanelDateChange,
}: Pick<SystemCalendarProps, 'onDateSelect' | 'onModeChange' | 'onPanelDateChange'>) {
  const screens = Grid.useBreakpoint();
  const selectDate: CalendarProps<Dayjs>['onSelect'] = (date, info) => {
    if (info.source === 'date') {
      onDateSelect(date.format('YYYY-MM-DD'));
    }
    if (info.source === 'month') {
      onModeChange('month');
      onPanelDateChange(date.format('YYYY-MM-DD'));
    }
  };
  const changePanel: CalendarProps<Dayjs>['onPanelChange'] = (date, mode) => {
    onModeChange(mode);
    onPanelDateChange(date.format('YYYY-MM-DD'));
  };
  return { compact: screens.md === false, selectDate, changePanel };
}

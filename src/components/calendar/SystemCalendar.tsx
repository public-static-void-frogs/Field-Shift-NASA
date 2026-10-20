import { Badge, Button, Calendar, Grid, Tooltip, Typography } from 'antd';
import type { CalendarProps } from 'antd';
import type { Dayjs } from 'dayjs';
import { categoryColors } from '../../data/planning';
import type { PlannedEvent } from '../../types/planning';

interface SystemCalendarProps {
  value: Dayjs;
  events: PlannedEvent[];
  onDateSelect: (date: string) => void;
  onEventSelect: (event: PlannedEvent) => void;
  mode: 'month' | 'year';
  onModeChange: (mode: 'month' | 'year') => void;
}
export function SystemCalendar({ value, events, onDateSelect, onEventSelect, mode, onModeChange }: SystemCalendarProps) {
  const screens = Grid.useBreakpoint();
  const compact = screens.md === false;
  const cellRender: CalendarProps<Dayjs>['cellRender'] = (date, info) => {
    if (info.type === 'month') {
      const count = events.filter(event => event.date.startsWith(date.format('YYYY-MM'))).length;
      return count ? <Badge color="#476b3c" text={`${count} planned actions`} /> : null;
    }
    if (info.type !== 'date') return info.originNode;
    const onDate = events.filter(event => event.date === date.format('YYYY-MM-DD'));
    if (!onDate.length) return null;
    if (compact) return (
      <Tooltip title={`${onDate.length} planned actions`}>
        <Badge count={onDate.length} color="#476b3c" />
      </Tooltip>
    );
    return (
      <div className="calendar-cell-events">
        {onDate.slice(0, 2).map(event => (
          <Tooltip title={`${event.fieldName}: ${event.title}`} key={event.id}>
            <Button
              type="text"
              className="calendar-cell-event"
              style={{ borderInlineStartColor: categoryColors[event.category] }}
              aria-label={`${event.fieldName}: ${event.title}`}
              onClick={click => {
                click.stopPropagation();
                onEventSelect(event);
              }}
            >
              {`${event.category} · ${event.fieldName}`}
            </Button>
          </Tooltip>
        ))}
        {onDate.length > 2 && <Typography.Text className="calendar-more-events">
          {`+${onDate.length - 2} more actions`}
        </Typography.Text>}
      </div>
    );
  };
  return (
    <Calendar
      className={`system-calendar ${compact ? 'system-calendar-compact' : ''}`}
      fullscreen={!compact}
      value={value}
      mode={mode}
      cellRender={cellRender}
      onSelect={(date, info) => {
        if (info.source === 'month') onModeChange('month');
        if (info.source === 'date' || info.source === 'month') onDateSelect(date.format('YYYY-MM-DD'));
      }}
      onPanelChange={(date, nextMode) => {
        onModeChange(nextMode);
        onDateSelect(date.format('YYYY-MM-DD'));
      }}
    />
  );
}

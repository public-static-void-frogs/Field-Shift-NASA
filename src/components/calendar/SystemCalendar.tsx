import { useTranslation } from 'react-i18next';
import { Badge, Button, Calendar, Grid, Tooltip } from 'antd';
import type { CSSProperties } from 'react';
import type { CalendarProps } from 'antd';
import type { Dayjs } from 'dayjs';
import { categoryColors } from '../../data/planning';
import { useFarm } from '../../hooks/useFarm';
import { getEventDecision } from '../../utils/eventResponses';
import { Clock3 } from 'lucide-react';
import type { PlannedEvent } from '../../types/planning';

interface SystemCalendarProps {
  value: Dayjs;
  events: PlannedEvent[];
  onDateSelect: (date: string) => void;
  onPanelDateChange: (date: string) => void;
  onEventSelect: (event: PlannedEvent) => void;
  mode: 'month' | 'year';
  onModeChange: (mode: 'month' | 'year') => void;
}
export function SystemCalendar({ value, events, onDateSelect, onEventSelect, mode, onModeChange, onPanelDateChange }: SystemCalendarProps) {
  const { t } = useTranslation();
  const { eventResponses } = useFarm();
  const screens = Grid.useBreakpoint();
  const compact = screens.md === false;
  const cellRender: CalendarProps<Dayjs>['cellRender'] = (date, info) => {
    if (info.type === 'month') {
      const count = events.filter(event => event.date.startsWith(date.format('YYYY-MM'))).length;
      return count ? <Badge color="#476b3c" text={t('{{value0}} planned actions', { value0: count })} /> : null;
    }
    if (info.type !== 'date') return info.originNode;
    const onDate = events.filter(event => event.date === date.format('YYYY-MM-DD'));
    if (!onDate.length) return null;
    if (compact) return (
      <Tooltip title={t('{{value0}} planned actions', { value0: onDate.length })}>
        <Badge count={onDate.length} color="#476b3c" />
      </Tooltip>
    );
    return (
      <div className="calendar-cell-events">
        {onDate.slice(0, 2).map(event => (
          <Tooltip title={`${getEventDecision(event, eventResponses) === 'accepted' ? t('Accepted') : t('Proposed')} · ${event.fieldName}: ${event.title}`} key={event.id}>
            <Button
              type="text"
              className={`calendar-cell-event ${getEventDecision(event, eventResponses) === 'proposed' ? 'calendar-event-proposed' : ''}`}
              style={{ '--event-color': categoryColors[event.category] } as CSSProperties}
              aria-label={`${event.fieldName}: ${event.title}`}
              onClick={click => {
                click.stopPropagation();
                onEventSelect(event);
              }}
            >
              {getEventDecision(event, eventResponses) === 'proposed' && <Clock3 size={11} aria-hidden="true" />}
              <span className="calendar-event-label">{`${event.category} · ${event.fieldName}`}</span>
            </Button>
          </Tooltip>
        ))}
        {onDate.length > 2 && <Button
          type="text"
          size="small"
          className="calendar-more-events"
          onClick={click => {
            click.stopPropagation();
            onDateSelect(date.format('YYYY-MM-DD'));
          }}
        >{t('+{{value0}} more', { value0: onDate.length - 2 })}</Button>}
      </div>
    );
  };
  return (
    <Calendar
      className={`system-calendar ${compact ? 'system-calendar-compact' : ''}`}
      fullscreen
      value={value}
      mode={mode}
      cellRender={cellRender}
      onSelect={(date, info) => {
        if (info.source === 'date') onDateSelect(date.format('YYYY-MM-DD'));
        if (info.source === 'month') {
          onModeChange('month');
          onPanelDateChange(date.format('YYYY-MM-DD'));
        }
      }}
      onPanelChange={(date, nextMode) => {
        onModeChange(nextMode);
        onPanelDateChange(date.format('YYYY-MM-DD'));
      }}
    />
  );
}

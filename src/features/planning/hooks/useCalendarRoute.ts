import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { PlannedEvent } from '../../../types/planning/planning.types.ts';
import { isPlanDate } from '../utils/planningDates.ts';
import { calendarPath } from '../utils/planningRoutes.ts';

export function useCalendarRoute(today: string) {
  const { date } = useParams<'date'>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const rawFieldId = Number(search.get('field'));
  const fieldId = Number.isSafeInteger(rawFieldId) && rawFieldId > 0 ? rawFieldId : undefined;
  const eventId = search.get('event') || undefined;
  const selectedDate = isPlanDate(date) ? date! : today;
  function changeDate(value: string) {
    navigate(calendarPath(value, fieldId), { preventScrollReset: true });
  }
  function changeField(value: string) {
    navigate(calendarPath(selectedDate, value === 'all' ? undefined : Number(value)), {
      preventScrollReset: true,
    });
  }
  function openEvent(event: PlannedEvent) {
    navigate(calendarPath(event.date, fieldId, event.id), { preventScrollReset: true });
  }
  function clearEvent() {
    changeDate(selectedDate);
  }
  function reset() {
    navigate(calendarPath(today), { preventScrollReset: true });
  }
  return { selectedDate, fieldId, eventId, changeDate, changeField, openEvent, clearEvent, reset };
}

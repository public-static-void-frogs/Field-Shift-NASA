import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { planningQueries } from '../../../api/planning/planning.queries.ts';
import { useFarm } from '../../../hooks/useFarm.ts';
import type { CalendarMode, PlannedEvent } from '../../../types/planning/planning.types.ts';
import { filterCalendarEvents } from '../utils/eventPresentation.ts';
import { getCalendarEvents } from '../utils/eventResponses.ts';
import { isPlanDate } from '../utils/planningDates.ts';
import { calendarPath } from '../utils/planningRoutes.ts';

export function useCalendarPage() {
  const { date } = useParams<'date'>();
  const [searchParams] = useSearchParams();
  const rawFieldId = Number(searchParams.get('field'));
  const fieldId = Number.isSafeInteger(rawFieldId) && rawFieldId > 0 ? rawFieldId : undefined;
  const eventId = searchParams.get('event') || undefined;
  const navigate = useNavigate();
  const { fields, eventResponses, planningToday } = useFarm();
  const { data: allPlanEvents } = useSuspenseQuery(planningQueries.events());
  const [category, setCategory] = useState('All actions');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('calendar');
  const [dayOpen, setDayOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const selectedDate = isPlanDate(date) ? date! : planningToday;
  const allEvents = allPlanEvents;
  const events = getCalendarEvents(allEvents, eventResponses);
  const visible = filterCalendarEvents(events, fieldId, category, query);
  const selectedEvents = visible.filter((event) => event.date === selectedDate);
  const selectedEvent = allEvents.find((event) => event.id === eventId);
  const selectedField = fields.find((field) => field.id === selectedEvent?.fieldId);

  function openEvent(event: PlannedEvent) {
    setDayOpen(false);
    navigate(calendarPath(event.date, fieldId, event.id), { preventScrollReset: true });
  }
  function closeDrawer() {
    setDayOpen(false);
    navigate(calendarPath(selectedDate, fieldId), { preventScrollReset: true });
  }

  function changeField(value: string) {
    navigate(calendarPath(selectedDate, value === 'all' ? undefined : Number(value)), {
      preventScrollReset: true,
    });
  }
  function changeDate(value: string) {
    navigate(calendarPath(value, fieldId), { preventScrollReset: true });
  }
  function selectDate(value: string) {
    changeDate(value);
    setDayOpen(true);
  }
  function resetView() {
    setCategory('All actions');
    setQuery('');
    setCalendarMode('month');
    setDayOpen(false);
    navigate(calendarPath(planningToday), { preventScrollReset: true });
  }

  return {
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
  };
}

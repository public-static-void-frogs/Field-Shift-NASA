import { useState } from 'react';
import type { CalendarFilters } from '../../../types/planning/calendarControls.types.ts';
import type { PlannedEvent } from '../../../types/planning/planning.types.ts';
import { filterCalendarEvents } from '../utils/eventPresentation.ts';

const initialFilters: CalendarFilters = { category: 'All actions', query: '' };
export function useCalendarFilters(events: PlannedEvent[], fieldId?: number) {
  const [criteria, setCriteria] = useState(initialFilters);
  function update(patch: Partial<CalendarFilters>) {
    setCriteria((current) => ({ ...current, ...patch }));
  }
  function reset() {
    setCriteria(initialFilters);
  }
  const visible = filterCalendarEvents(events, fieldId, criteria.category, criteria.query);
  return { criteria, update, reset, visible };
}

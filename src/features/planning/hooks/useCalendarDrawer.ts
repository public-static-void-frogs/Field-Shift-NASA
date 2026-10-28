import { useState } from 'react';
import type { CalendarDrawerActions } from '../../../types/planning/calendarControls.types.ts';
import type { PlannedEvent } from '../../../types/planning/planning.types.ts';

export function useCalendarDrawer(eventId: string | undefined, actions: CalendarDrawerActions) {
  const [dayOpen, setDayOpen] = useState(false);
  function selectDate(date: string) {
    actions.changeDate(date);
    setDayOpen(true);
  }
  function openEvent(event: PlannedEvent) {
    setDayOpen(false);
    actions.openEvent(event);
  }
  function close() {
    setDayOpen(false);
    actions.clearEvent();
  }
  function reset() {
    setDayOpen(false);
  }
  return { isOpen: Boolean(eventId) || dayOpen, selectDate, openEvent, close, reset };
}

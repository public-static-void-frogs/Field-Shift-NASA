import type { Field } from '../fields/field.types.ts';
import type { PlannedEvent } from './planning.types.ts';

export interface CalendarDrawerContentProps {
  selectedEvent?: PlannedEvent;
  selectedField?: Field;
  eventId?: string;
  selectedEvents: PlannedEvent[];
  planningToday: string;
  openEvent: (event: PlannedEvent) => void;
}

export interface CalendarActionDetailsProps {
  event: PlannedEvent;
  field?: Field;
  planningToday: string;
}

export interface CalendarFieldConditionsProps {
  field: Field;
}

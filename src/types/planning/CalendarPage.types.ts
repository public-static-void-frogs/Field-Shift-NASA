import type { Navigate } from '../shared/navigation.types.ts';

export interface CalendarPageProps {
  navigate: Navigate;
  date?: string;
  fieldId?: number;
  eventId?: string;
}

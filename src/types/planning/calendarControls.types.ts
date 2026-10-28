import type { PlannedEvent } from './planning.types.ts';

export interface CalendarFilters {
  category: string;
  query: string;
}
export interface CalendarDrawerActions {
  changeDate: (date: string) => void;
  openEvent: (event: PlannedEvent) => void;
  clearEvent: () => void;
}

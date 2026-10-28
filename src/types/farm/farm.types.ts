import type { FieldActions } from '../fields/api.types.ts';
import type { Field } from '../fields/field.types.ts';
import type { EventDecision, EventResponses } from '../planning/planning.types.ts';
export interface FarmProfile {
  availableSeasons: string[];
  farmName: string;
  season: string;
  fullName: string;
  initials: string;
  email: string;
  role: string;
  location: string;
  locationLabel: string;
  timeZone: string;
  units: 'metric' | 'imperial';
  theme: 'light' | 'dark' | 'system';
}

export interface FarmData extends FieldActions {
  planningToday: string;
  fields: Field[];
  preferences: FarmProfile;
  eventResponses: EventResponses;
  respondToStrategy: (fieldId: number, status: EventDecision) => Promise<EventResponses>;
  isRespondingToStrategy: boolean;
}

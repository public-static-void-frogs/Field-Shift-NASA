import { createContext } from 'react';
import type { Field } from '../types/field';
import type { EventDecision, EventResponses } from '../types/planning';

export type Preferences = {
  farmName: string;
  season: string;
};

export type FarmState = {
  fields: Field[];
  eventResponses: EventResponses;
  respondToStrategy: (fieldId: number, status: EventDecision) => void;
  notes: Record<number, string>;
  preferences: Preferences;
  addField: (field: Field) => void;
  removeField: (id: number) => void;
  saveNotes: (id: number, note: string) => void;
  savePreferences: (values: Preferences) => void;
};

export const FarmContext = createContext<FarmState | null>(null);

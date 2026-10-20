import { createContext } from 'react';
import type { Field } from '../types/field';

export type Preferences = {
  farmName: string;
  season: string;
};

export type FarmState = {
  fields: Field[];
  notes: Record<number, string>;
  preferences: Preferences;
  addField: (field: Field) => void;
  removeField: (id: number) => void;
  saveNotes: (id: number, note: string) => void;
  savePreferences: (values: Preferences) => void;
};

export const FarmContext = createContext<FarmState | null>(null);

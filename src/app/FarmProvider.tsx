import { useState } from 'react';
import type { ReactNode } from 'react';
import { initialFields } from '../data/fields';
import { FarmContext } from './FarmContext';
import type { FarmState, Preferences } from './FarmContext';

export function FarmProvider({ children }: { children: ReactNode }) {
  const [fields, setFields] = useState(initialFields);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [preferences, setPreferences] = useState<Preferences>({
    farmName: 'Green Valley Farm',
    season: '2026',
  });

  const value: FarmState = {
    fields,
    notes,
    preferences,
    addField: field => setFields(current => [...current, field]),
    removeField: id => setFields(current => current.filter(field => field.id !== id)),
    saveNotes: (id, note) => setNotes(current => ({ ...current, [id]: note })),
    savePreferences: setPreferences,
  };

  return (
    <FarmContext.Provider value={value}>
      {children}
    </FarmContext.Provider>
  );
}

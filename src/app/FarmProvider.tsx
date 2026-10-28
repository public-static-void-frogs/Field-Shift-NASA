import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { initialFields } from '../data/fields';
import { getSystemPlanEvents } from '../data/planning';
import {
  eventResponsesStorageKey,
  parseEventResponses,
  updateStrategyResponse,
} from '../utils/eventResponses';
import type { EventResponses } from '../types/planning';
import { FarmContext } from './FarmContext';
import type { FarmState, Preferences } from './FarmContext';

export function FarmProvider({ children }: { children: ReactNode }) {
  const [fields, setFields] = useState(initialFields);
  const [eventResponses, setEventResponses] = useState<EventResponses>(() => {
    try {
      return parseEventResponses(localStorage.getItem(eventResponsesStorageKey));
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(eventResponsesStorageKey, JSON.stringify(eventResponses));
    } catch {
      /* Keep the current session usable when browser storage is unavailable. */
    }
  }, [eventResponses]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [preferences, setPreferences] = useState<Preferences>({
    farmName: 'Green Valley Farm',
    season: '2026',
  });

  const value: FarmState = {
    fields,
    eventResponses,
    respondToStrategy: (fieldId, status) => {
      const events = getSystemPlanEvents(fields).filter((item) => item.fieldId === fieldId);
      if (events.length)
        setEventResponses((current) => updateStrategyResponse(current, events, status));
    },
    notes,
    preferences,
    addField: (field) => setFields((current) => [...current, field]),
    removeField: (id) => {
      setFields((current) => current.filter((field) => field.id !== id));
      setEventResponses((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !key.startsWith(`field-${id}-`)),
        ),
      );
    },
    saveNotes: (id, note) => setNotes((current) => ({ ...current, [id]: note })),
    savePreferences: setPreferences,
  };

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

import { useState } from 'react';
import type { LandEvent } from '../../../types/fields/history.types.ts';
import type { LandHistoryFilters } from '../../../types/fields/historyFilters.types.ts';
import { filterLandHistory } from '../utils/fieldFilters.ts';

const initialCriteria: LandHistoryFilters = {
  category: 'All activities',
  year: 'All years',
  query: '',
};
export function useLandHistoryFilters(events: LandEvent[]) {
  const [criteria, setCriteria] = useState(initialCriteria);
  function update(patch: Partial<LandHistoryFilters>) {
    setCriteria((current) => ({ ...current, ...patch }));
  }
  function reset() {
    setCriteria(initialCriteria);
  }
  const visible = filterLandHistory(events, criteria.category, criteria.year, criteria.query);
  return { criteria, update, reset, visible };
}

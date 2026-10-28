import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fieldQueries } from '../../../api/fields/fields.queries.ts';
import { filterLandHistory } from '../utils/fieldFilters.ts';

export function useLandHistory(fieldId: number) {
  const { data: history } = useSuspenseQuery(fieldQueries.history(fieldId));
  const [category, setCategory] = useState('All activities');
  const [year, setYear] = useState('All years');
  const [query, setQuery] = useState('');
  const events = history?.events ?? [];
  const seasons = history?.seasons ?? [];
  const visible = filterLandHistory(events, category, year, query);
  function resetFilters() {
    setCategory('All activities');
    setYear('All years');
    setQuery('');
  }

  return {
    category,
    setCategory,
    year,
    setYear,
    query,
    setQuery,
    events,
    seasons,
    visible,
    resetFilters,
  };
}

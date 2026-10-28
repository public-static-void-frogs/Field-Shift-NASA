import { useState } from 'react';
import type { Field } from '../../../types/fields/field.types.ts';
import type { FieldFilters } from '../utils/fieldFilters.ts';
import { filterFields } from '../utils/fieldFilters.ts';

const initialCriteria: Omit<FieldFilters, 'overview'> = {
  query: '',
  status: 'All fields',
  crop: 'All crops',
  filters: [],
};
export function useFieldFilters(fields: Field[], overview: boolean) {
  const [criteria, setCriteria] = useState(initialCriteria);
  function update(patch: Partial<typeof initialCriteria>) {
    setCriteria((current) => ({ ...current, ...patch }));
  }
  function reset() {
    setCriteria(initialCriteria);
  }
  const visible = filterFields(fields, { overview, ...criteria });
  return { criteria, update, reset, visible };
}

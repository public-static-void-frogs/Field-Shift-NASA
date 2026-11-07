import { useCallback, useState } from 'react';
import { addFieldSelection, toggleFieldSelection } from '../utils/lassoSelection.ts';

/** Draft map selection only; never changes the account's saved fields. */
export function useMapFieldSelection() {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setSelectedIds((previous) => toggleFieldSelection(previous, id));
  }, []);
  const add = useCallback((ids: string[]) => {
    setSelectedIds((previous) => addFieldSelection(previous, ids));
  }, []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return { selectedIds, toggle, add, clear };
}

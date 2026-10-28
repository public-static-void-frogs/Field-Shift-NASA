import { useState } from 'react';
import { useMatches } from 'react-router-dom';
import type { AppRouteHandle } from '../../../types/shared/router.types.ts';

export function useAppLayout() {
  const matches = useMatches();
  const handle = matches.reduce<AppRouteHandle>(
    (value, match) => ({ ...value, ...(match.handle as AppRouteHandle | undefined) }),
    {},
  );
  const active = handle.navigationKey ?? '';
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 991px)').matches);

  return { handle, active, collapsed, setCollapsed };
}

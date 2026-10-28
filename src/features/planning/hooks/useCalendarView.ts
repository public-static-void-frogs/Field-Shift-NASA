import { useState } from 'react';
import type { CalendarMode } from '../../../types/planning/planning.types.ts';

export function useCalendarView() {
  const [tab, setTab] = useState('calendar');
  const [mode, setMode] = useState<CalendarMode>('month');
  function reset() {
    setMode('month');
  }
  return { tab, setTab, mode, setMode, reset };
}

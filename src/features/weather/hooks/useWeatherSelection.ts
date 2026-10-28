import { useState } from 'react';
import type { HistoryRange } from '../../../types/weather/weather.types.ts';

export function useWeatherSelection() {
  const [range, setRange] = useState<HistoryRange>('7 days');
  const [selectedKey, selectReading] = useState(0);
  function changeRange(value: HistoryRange) {
    setRange(value);
    selectReading(0);
  }
  return { range, changeRange, selectedKey, selectReading };
}

import { useState } from 'react';
import type { HistoryRange } from '../../../api/weather/weather.api.ts';

export function useWeatherSelection() {
  const [range, setRange] = useState<HistoryRange>('7 days');
  const [selectedKey, selectReading] = useState(0);
  function changeRange(value: HistoryRange) {
    setRange(value);
    selectReading(0);
  }
  return { range, changeRange, selectedKey, selectReading };
}

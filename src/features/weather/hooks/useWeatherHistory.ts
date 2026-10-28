import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { weatherQueries } from '../../../api/weather/weather.queries.ts';
import { useFarm } from '../../../hooks/useFarm.ts';
import type { HistoryRange } from '../../../types/weather/weather.types.ts';
import { type WeatherMetric } from '../../../types/weather/weather.types.ts';
import { weatherMetrics } from '../constants/weather.constants.ts';
import { getWeatherChange, selectWeatherReading } from '../utils/weatherPresentation.ts';

export function useWeatherHistory() {
  const { t } = useTranslation();
  const { preferences } = useFarm();
  const [range, setRange] = useState<HistoryRange>('7 days');
  const [metric, setMetric] = useState<WeatherMetric>('temperature');
  const [selectedKey, setSelectedKey] = useState(0);
  const { data: records } = useSuspenseQuery(weatherQueries.history(range));
  const selected = selectWeatherReading(records, selectedKey);
  const metricConfig = weatherMetrics[metric];
  const config = {
    ...metricConfig,
    title: t(metricConfig.title),
    description: t(metricConfig.description),
    unit: t(metricConfig.unit),
  };
  const change = getWeatherChange(records, selected, metric);

  function changeRange(value: HistoryRange) {
    setRange(value);
    setSelectedKey(0);
  }

  return {
    preferences,
    range,
    changeRange,
    metric,
    setMetric,
    setSelectedKey,
    records,
    selected,
    config,
    change,
  };
}

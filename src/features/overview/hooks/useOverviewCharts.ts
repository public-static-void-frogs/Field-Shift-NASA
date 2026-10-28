import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { overviewQueries } from '../../../api/overview/overview.queries.ts';
import { useFarm } from '../../../hooks/useFarm.ts';
import type { TrendMetric } from '../../../types/overview/overview.types.ts';

export function useOverviewCharts() {
  const { fields } = useFarm();
  const [days, setDays] = useState(30);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('health');
  const [hiddenFields, setHiddenFields] = useState<number[]>([]);
  const [crop, setCrop] = useState<string | null>(null);
  const [barMetric, setBarMetric] = useState<TrendMetric>('health');
  const { data: charts } = useSuspenseQuery(overviewQueries.charts({ days, metric: trendMetric }));
  const cropAreas = charts.cropAreas;
  const totalArea = cropAreas.reduce((sum, item) => sum + item.area, 0);
  const activeCrop = cropAreas.some((item) => item.name === crop) ? crop : null;
  const trendData = charts.trends;

  function toggleField(id: number) {
    setHiddenFields((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }
  function selectCrop(name: string) {
    setCrop((current) => (current === name ? null : name));
  }

  return {
    fields,
    days,
    setDays,
    trendMetric,
    setTrendMetric,
    hiddenFields,
    toggleField,
    selectCrop,
    barMetric,
    setBarMetric,
    cropAreas,
    totalArea,
    activeCrop,
    trendData,
  };
}

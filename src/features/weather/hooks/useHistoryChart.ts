import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useChartAnimation } from '../../../hooks/useChartAnimation.ts';
import type {
  HistoryChartProps,
  HistoryChartSelection,
} from '../../../types/weather/HistoryChart.types.ts';
import { getWeatherMetricConfig, selectWeatherReading } from '../utils/weatherPresentation.ts';

export function useHistoryChart({ records, metric, selectedKey, onSelect }: HistoryChartProps) {
  const { t } = useTranslation();
  const gradientId = useId();
  const animate = useChartAnimation();
  const config = getWeatherMetricConfig(metric, t);
  const timeline = [...records].reverse();
  const selected = selectWeatherReading(records, selectedKey);

  function selectPoint(state: HistoryChartSelection) {
    if (state.activeTooltipIndex == null) {
      return;
    }
    const record = timeline[Number(state.activeTooltipIndex)];
    if (record) {
      onSelect(record.key);
    }
  }
  return { gradientId, animate, config, timeline, selected, selectPoint };
}

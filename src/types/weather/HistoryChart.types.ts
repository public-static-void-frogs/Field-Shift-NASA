import type { WeatherMetric, WeatherRecord } from './weather.types.ts';

export type HistoryChartProps = {
  records: WeatherRecord[];
  metric: WeatherMetric;
  selectedKey: number;
  onSelect: (key: number) => void;
};

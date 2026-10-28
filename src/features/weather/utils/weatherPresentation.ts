import { CloudRain, CloudSun, Sun } from 'lucide-react';
import type { WeatherMetric, WeatherRecord } from '../../../types/weather/weather.types.ts';

export function getWeatherIcon(conditions: string) {
  if (conditions === 'Light rain') {
    return CloudRain;
  }
  if (conditions === 'Partly cloudy') {
    return CloudSun;
  }
  return Sun;
}
export function selectWeatherReading(records: WeatherRecord[], key: number) {
  return records.find((record) => record.key === key) ?? records[0];
}
export function getWeatherChange(
  records: WeatherRecord[],
  selected: WeatherRecord,
  metric: WeatherMetric,
) {
  const previous = records.find((record) => record.key === selected.key + 1);
  if (!previous) {
    return null;
  }
  return Number((selected[metric] - previous[metric]).toFixed(1));
}

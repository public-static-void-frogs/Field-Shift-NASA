import type { TFunction } from 'i18next';
import type {
  CropMetricBounds,
  CropRiskAlert,
  CropRiskLevel,
  WeatherMetric,
  WeatherRecord,
  WeatherUnits,
} from '../../../types/weather/weather.types.ts';
import { formatWeatherValue, getWeatherMetricConfig } from './weatherPresentation.ts';

export const cropRiskColors: Record<CropRiskLevel, string> = {
  good: '#2f7d32',
  caution: '#c37b08',
  high: '#c7362f',
  unknown: '#657b8d',
};

export function weatherReadingRisk(record: WeatherRecord, metric: WeatherMetric, low = false) {
  const result = record.cropAssessment?.metrics[metric];
  if (low) {
    return result?.lowRiskLevel ?? 'unknown';
  }
  return result?.valueRiskLevel ?? 'unknown';
}

export function formatCropAlert(alert: CropRiskAlert, units: WeatherUnits, t: TFunction) {
  let label = getWeatherMetricConfig(alert.metric, t, units).title;
  if (alert.reading === 'low') {
    label = t('Daily low');
  }
  const values = {
    metric: label,
    value: formatWeatherValue(alert.value, alert.unit),
    limit: formatWeatherValue(alert.boundary, alert.unit),
  };
  if (alert.code === 'below_critical' || alert.code === 'below_good') {
    return t('{{metric}}: {{value}}, below {{limit}}.', values);
  }
  return t('{{metric}}: {{value}}, above {{limit}}.', values);
}

export function cropChartDomain(
  records: WeatherRecord[],
  metric: WeatherMetric,
  bounds?: CropMetricBounds,
) {
  const values = records.flatMap((record) => {
    const readings = [record[metric]];
    if (metric === 'temperature') {
      readings.push(record.low);
    }
    return readings.filter((value): value is number => value !== null);
  });
  if (bounds) {
    values.push(bounds.goodLow, bounds.ideal, bounds.goodHigh);
    if (bounds.criticalLow !== null) {
      values.push(bounds.criticalLow);
    }
    if (bounds.criticalHigh !== null) {
      values.push(bounds.criticalHigh);
    }
  }
  if (!values.length) {
    return [0, 1] as [number, number];
  }
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.12, 1);
  let low = Math.floor(minimum - padding);
  if (metric !== 'temperature') {
    low = Math.max(0, low);
  }
  return [low, Math.ceil(maximum + padding)] as [number, number];
}

export const cropRiskLabelStyles: Record<
  CropRiskLevel,
  { fill: string; text: string; stroke: string }
> = {
  good: { fill: '#ffffff', text: '#203b2b', stroke: '#91ad96' },
  caution: { fill: '#fff3bd', text: '#713b08', stroke: '#a86707' },
  high: { fill: '#b42318', text: '#ffffff', stroke: '#8f1d15' },
  unknown: { fill: '#ffffff', text: '#243b4d', stroke: '#a6b5bf' },
};

export function cropZoneGradient(bounds: CropMetricBounds, minimum: number, maximum: number) {
  const stops = new Map<number, string>();
  stops.set(minimum, bounds.criticalLow === null ? '#c3d6ae' : '#f3b1aa');
  if (bounds.criticalLow !== null) {
    stops.set(bounds.criticalLow, '#f5b8ad');
    stops.set((bounds.criticalLow + bounds.goodLow) / 2, '#fae8bb');
  }
  stops.set(bounds.goodLow, '#d9e2bb');
  stops.set(bounds.ideal, '#aec99c');
  stops.set(bounds.goodHigh, '#d9e2bb');
  if (bounds.criticalHigh !== null) {
    stops.set((bounds.goodHigh + bounds.criticalHigh) / 2, '#fae8bb');
    stops.set(bounds.criticalHigh, '#f5b8ad');
  }
  stops.set(maximum, bounds.criticalHigh === null ? '#c3d6ae' : '#f3b1aa');

  return [...stops.entries()]
    .sort(([a], [b]) => b - a)
    .map(([value, color]) => ({
      offset: Math.max(0, Math.min(100, ((maximum - value) / (maximum - minimum)) * 100)),
      color,
    }));
}

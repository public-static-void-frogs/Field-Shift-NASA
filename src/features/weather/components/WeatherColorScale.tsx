import { useTranslation } from 'react-i18next';
import type {
  WeatherMetric,
  WeatherRecord,
  WeatherUnits,
} from '../../../types/weather/weather.types.ts';
import { formatWeatherValue } from '../utils/weatherPresentation.ts';
import { summarizeWeather, weatherColor } from '../utils/weatherVisuals.ts';

type WeatherColorScaleProps = {
  records: WeatherRecord[];
  metric: WeatherMetric;
  units: WeatherUnits;
};

export function WeatherColorScale({ records, metric, units }: WeatherColorScaleProps) {
  const { t } = useTranslation();
  const summary = summarizeWeather(records, metric);
  if (!summary) {
    return null;
  }
  const low = summary.low[metric]!;
  const high = summary.high[metric]!;
  const colors = Array.from({ length: 5 }, (_, index) =>
    weatherColor(low + ((high - low) * index) / 4, metric, units),
  );

  return (
    <div className="weather-color-scale" aria-label={t('Colour scale')}>
      <span>{formatWeatherValue(low, units[metric])}</span>
      <span
        className="weather-color-scale-bar"
        style={{ background: `linear-gradient(to right, ${colors.join(', ')})` }}
      />
      <span>{formatWeatherValue(high, units[metric])}</span>
    </div>
  );
}

import { WeatherConditionIcon } from './WeatherConditionIcon';
import type { CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CloudRain,
  Droplets,
  Sprout,
  Thermometer,
  Wind,
} from 'lucide-react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import type {
  WeatherMetric,
  WeatherRecord,
  WeatherUnits,
} from '../../../types/weather/weather.types.ts';
import {
  formatWeatherDate,
  formatWeatherValue,
  getWeatherMetricConfig,
  windDirection,
} from '../utils/weatherPresentation.ts';
import { weatherColor } from '../utils/weatherVisuals.ts';

type WeatherDayDetailsProps = {
  record: WeatherRecord;
  records: WeatherRecord[];
  metric: WeatherMetric;
  units: WeatherUnits;
  forecast?: boolean;
  soilDepth: string;
  onSelect: (key: number) => void;
};

export function WeatherDayDetails({
  record,
  records,
  metric,
  units,
  forecast = false,
  soilDepth,
  onSelect,
}: WeatherDayDetailsProps) {
  const { t, i18n } = useTranslation();
  const config = getWeatherMetricConfig(metric, t, units);
  const color = weatherColor(record[metric], metric, units);
  const readings = [
    {
      key: 'temperature',
      icon: Thermometer,
      label: 'High / low',
      value: `${formatWeatherValue(record.temperature)} / ${formatWeatherValue(record.low, units.temperature)}`,
      className: 'warm',
    },
    {
      key: 'rainfall',
      icon: CloudRain,
      label: 'Precipitation',
      value: formatWeatherValue(record.rainfall, units.rainfall),
      className: 'rain',
    },
    {
      key: 'moisture',
      icon: Sprout,
      label: 'Soil moisture',
      value: formatWeatherValue(record.moisture, '%'),
      className: 'soil',
    },
    {
      key: 'humidity',
      icon: Droplets,
      label: 'Humidity',
      value: formatWeatherValue(record.humidity, '%'),
      className: 'humidity',
    },
    {
      key: 'wind',
      icon: Wind,
      label: 'Wind',
      value: `${formatWeatherValue(record.wind, units.wind)} ${windDirection(record.windDirection, t)}`,
      className: 'wind',
    },
  ];

  return (
    <aside
      className="weather-day-details"
      aria-label={t('Selected day conditions')}
      aria-live="polite"
    >
      <div className="weather-detail-heading">
        <CalendarDays size={17} />
        <span>{t('Day at a glance')}</span>
        <span className="weather-detail-type">{forecast ? t('Forecast') : t('History')}</span>
      </div>
      <Select
        className="full-width"
        aria-label={t('Inspect weather date')}
        value={record.key}
        onChange={onSelect}
        options={records.map((item) => ({
          value: item.key,
          label: formatWeatherDate(item.date, i18n.resolvedLanguage),
        }))}
      />
      <div className="weather-selected-hero" style={{ '--reading-color': color } as CSSProperties}>
        <div>
          <span>{config.title}</span>
          <strong>
            {formatWeatherValue(record[metric])}
            <small>{config.unit}</small>
          </strong>
        </div>
        <WeatherConditionIcon conditions={record.conditions} size={44} strokeWidth={1.3} />
      </div>
      <div className="weather-selected-condition">{t(record.conditions)}</div>
      <div className="weather-detail-readings">
        {readings.map(({ key, icon: ReadingIcon, label, value, className }) => (
          <div
            key={key}
            className={`weather-detail-reading weather-reading-${className}`}
            data-active={metric === key}
          >
            <span className="weather-reading-icon">
              <ReadingIcon size={21} strokeWidth={1.6} />
            </span>
            <div>
              <span>
                {t(label)}
                {key === 'moisture' && <small> · {soilDepth}</small>}
              </span>
              <strong>{value}</strong>
            </div>
            {key === 'temperature' && (
              <span className="weather-high-low">
                <ArrowUp size={12} />
                <ArrowDown size={12} />
              </span>
            )}
          </div>
        ))}
      </div>
      {forecast && record.rainChance !== null && (
        <div className="weather-chance-row">
          <span>{t('Rain chance')}</span>
          <strong>{Math.round(record.rainChance)}%</strong>
          <span className="weather-chance-track">
            <span style={{ width: `${record.rainChance}%` }} />
          </span>
        </div>
      )}
    </aside>
  );
}

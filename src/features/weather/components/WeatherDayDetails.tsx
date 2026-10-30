import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import type {
  WeatherMetric,
  WeatherRecord,
  WeatherUnits,
} from '../../../types/weather/weather.types.ts';
import { formatCropAlert } from '../utils/cropRiskPresentation.ts';
import {
  formatWeatherDate,
  formatWeatherValue,
  getWeatherMetricConfig,
} from '../utils/weatherPresentation.ts';

type WeatherDayDetailsProps = {
  record: WeatherRecord;
  records: WeatherRecord[];
  metric: WeatherMetric;
  units: WeatherUnits;
  soilDepth: string;
  onSelect: (key: number) => void;
};

export function WeatherDayDetails({
  record,
  records,
  metric,
  units,
  soilDepth,
  onSelect,
}: WeatherDayDetailsProps) {
  const { t, i18n } = useTranslation();
  const config = getWeatherMetricConfig(metric, t, units);
  const assessment = record.cropAssessment?.metrics[metric];
  const alerts = record.cropAssessment?.alerts.filter((alert) => alert.metric === metric) ?? [];
  const labels = {
    good: 'Good for crop',
    caution: 'Crop caution',
    high: 'High crop risk',
    unknown: 'Incomplete assessment',
  };
  const risk = assessment?.riskLevel ?? 'unknown';

  return (
    <section
      className="weather-history-reading"
      aria-label={t('Selected day conditions')}
      aria-live="polite"
    >
      <div className="weather-history-date">
        <label htmlFor="weather-history-day">{t('Selected day')}</label>
        <Select
          id="weather-history-day"
          aria-label={t('Inspect weather date')}
          value={record.key}
          onChange={onSelect}
          options={records.map((item) => ({
            value: item.key,
            label: formatWeatherDate(item.date, i18n.resolvedLanguage),
          }))}
        />
      </div>
      <div className="weather-history-value">
        <span>{config.title}</span>
        <strong>{formatWeatherValue(record[metric], config.unit)}</strong>
        {metric === 'temperature' && (
          <span>
            {t('Daily low')} {formatWeatherValue(record.low, config.unit)}
          </span>
        )}
        {metric === 'moisture' && <span>{soilDepth}</span>}
      </div>
      <div className="weather-history-condition" data-risk={risk}>
        <strong>{t(labels[risk])}</strong>
        {alerts.length > 0 && (
          <ul>
            {alerts.map((alert) => (
              <li key={`${alert.metric}-${alert.reading}`}>
                ⚠️ {formatCropAlert(alert, units, t)}
              </li>
            ))}
          </ul>
        )}
        {risk === 'unknown' && <p>{t('Missing readings are not assessed.')}</p>}
      </div>
    </section>
  );
}

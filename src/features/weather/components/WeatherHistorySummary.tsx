import { ArrowDownRight, ArrowUpRight, CloudRain, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  WeatherMetric,
  WeatherRecord,
  WeatherUnits,
} from '../../../types/weather/weather.types.ts';
import { formatWeatherValue } from '../utils/weatherPresentation.ts';
import { summarizeWeather } from '../utils/weatherVisuals.ts';

type WeatherHistorySummaryProps = {
  records: WeatherRecord[];
  metric: WeatherMetric;
  units: WeatherUnits;
};

export function WeatherHistorySummary({ records, metric, units }: WeatherHistorySummaryProps) {
  const { t, i18n } = useTranslation();
  const summary = summarizeWeather(records, metric);
  if (!summary) {
    return null;
  }
  function day(date: string) {
    return new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  }

  return (
    <div className="weather-history-summary">
      <div>
        <ArrowUpRight size={17} />
        <span>
          {t('Highest')}
          <strong>{formatWeatherValue(summary.high[metric], units[metric])}</strong>
        </span>
        <small>{day(summary.high.date)}</small>
      </div>
      <div>
        <ArrowDownRight size={17} />
        <span>
          {t('Lowest')}
          <strong>{formatWeatherValue(summary.low[metric], units[metric])}</strong>
        </span>
        <small>{day(summary.low.date)}</small>
      </div>
      {metric === 'rainfall' ? (
        <div>
          <CloudRain size={17} />
          <span>
            {t('Period total')}
            <strong>{formatWeatherValue(summary.total, units[metric])}</strong>
          </span>
        </div>
      ) : (
        <div>
          <Minus size={17} />
          <span>
            {t('Average')}
            <strong>{formatWeatherValue(summary.average, units[metric])}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

import type { CSSProperties } from 'react';
import { WeatherConditionIcon } from './WeatherConditionIcon';
import { useQuery } from '@tanstack/react-query';
import { CloudRain, ThermometerSnowflake } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WeatherLocation } from '../../../api/weather/weather.queries.ts';
import { weatherQueries } from '../../../api/weather/weather.queries.ts';
import type { WeatherSeries } from '../../../types/weather/weather.types.ts';
import { formatWeatherValue } from '../utils/weatherPresentation.ts';
import { weatherColor, weatherHighlights } from '../utils/weatherVisuals.ts';
import { WeatherStatus } from './WeatherStatus';

type WeatherNowProps = { location: WeatherLocation; forecast?: WeatherSeries };

export function WeatherNow({ location, forecast }: WeatherNowProps) {
  const { t } = useTranslation();
  const query = useQuery(weatherQueries.current(location));
  const current = query.data;

  if (!current || query.isError) {
    return (
      <WeatherStatus
        hasLocation={location.latitude !== null && location.longitude !== null}
        pending={query.isLoading}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  }
  const highlights = weatherHighlights(forecast?.records ?? []);

  return (
    <div
      className="weather-now"
      style={
        {
          '--current-temperature-color': weatherColor(
            current.temperature,
            'temperature',
            current.units,
          ),
        } as CSSProperties
      }
    >
      <div className="weather-now-main">
        <div className="weather-now-eyebrow">
          <span className="weather-live-dot" />
          {t('Now at your farm')}
        </div>
        <div className="weather-now-temperature">
          <WeatherConditionIcon conditions={current.conditions} size={45} strokeWidth={1.3} />
          <strong>
            {formatWeatherValue(current.temperature)}
            <small>{current.units.temperature}</small>
          </strong>
          <div>
            <span>{t(current.conditions)}</span>
            <small>
              {t('Feels like {{value}}', {
                value: formatWeatherValue(current.feelsLike, current.units.temperature),
              })}
            </small>
          </div>
        </div>
      </div>
      <div className="weather-now-highlight">
        <CloudRain size={23} />
        <div>
          <span>{t('Precipitation · next 7 days')}</span>
          <strong>{formatWeatherValue(highlights.rainTotal, current.units.rainfall)}</strong>
        </div>
      </div>
      <div className="weather-now-highlight">
        <ThermometerSnowflake size={23} />
        <div>
          <span>{t('Coolest night · next 7 days')}</span>
          <strong>
            {formatWeatherValue(highlights.coolestNight?.low ?? null, current.units.temperature)}
          </strong>
        </div>
      </div>
    </div>
  );
}

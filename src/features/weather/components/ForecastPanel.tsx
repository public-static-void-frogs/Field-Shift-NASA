import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Card } from 'antd';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { farmQueries } from '../../../api/farm/farm.queries.ts';
import { weatherQueries } from '../../../api/weather/weather.queries.ts';
import type { WeatherMetric, WeatherSeries } from '../../../types/weather/weather.types.ts';
import { selectWeatherReading } from '../utils/weatherPresentation.ts';
import { HistoryChart } from './HistoryChart';
import { WeatherColorScale } from './WeatherColorScale';
import { WeatherCalendar } from './WeatherCalendar';
import { WeatherDayDetails } from './WeatherDayDetails';
import { WeatherMetricTabs } from './WeatherMetricTabs';
import { WeatherNow } from './WeatherNow';
import { WeatherSource } from './WeatherSource';
import { WeatherStatus } from './WeatherStatus';

type ForecastPanelProps = { metric?: WeatherMetric; showNow?: boolean };

export function ForecastPanel({ metric, showNow = false }: ForecastPanelProps) {
  const { t } = useTranslation();
  const { data: preferences } = useSuspenseQuery(farmQueries.profile());
  const query = useQuery(weatherQueries.forecast(preferences));
  const [localMetric, setMetric] = useState<WeatherMetric>('temperature');
  const activeMetric = metric ?? localMetric;

  return (
    <>
      {showNow && <WeatherNow location={preferences} forecast={query.data} />}
      {!metric && <WeatherMetricTabs metric={localMetric} onChange={setMetric} />}
      <Card
        className="weather-forecast-card"
        title={
          <span className="weather-section-title">
            <CalendarDays size={19} />
            {t('Your next 14 days')}
          </span>
        }
      >
        {query.data && query.data.records.length > 0 && !query.isError ? (
          <ForecastExplorer data={query.data} metric={activeMetric} />
        ) : (
          <WeatherStatus
            hasLocation={preferences.latitude !== null && preferences.longitude !== null}
            pending={query.isLoading}
            error={query.error}
            retry={() => void query.refetch()}
          />
        )}
      </Card>
    </>
  );
}

type ForecastExplorerProps = { data: WeatherSeries; metric: WeatherMetric };

function ForecastExplorer({ data, metric }: ForecastExplorerProps) {
  const { t } = useTranslation();
  const [selectedKey, selectReading] = useState(0);
  const selected = selectWeatherReading(data.records, selectedKey);

  return (
    <>
      <div className="weather-forecast-layout">
        <div className="weather-forecast-main">
          <WeatherCalendar
            records={data.records}
            units={data.units}
            metric={metric}
            selectedKey={selected.key}
            onSelect={selectReading}
          />
          <WeatherColorScale records={data.records} metric={metric} units={data.units} />
          <div className="weather-forecast-trend-heading">
            <span>{t('How conditions are changing')}</span>
            <span className="weather-trend-key">
              <span />
              {t('Forecast')}
            </span>
          </div>
          <HistoryChart
            records={data.records}
            units={data.units}
            metric={metric}
            selectedKey={selected.key}
            onSelect={selectReading}
            forecast
          />
        </div>
        <WeatherDayDetails
          record={selected}
          records={data.records}
          units={data.units}
          metric={metric}
          onSelect={selectReading}
          soilDepth={data.soilDepth}
          forecast
        />
      </div>
      <WeatherSource data={data} />
    </>
  );
}

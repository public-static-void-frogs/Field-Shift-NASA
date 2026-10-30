import type { HistoryRange } from '../api/weather/weather.api.ts';
import { WeatherConditionIcon } from '../features/weather/components/WeatherConditionIcon';
import { useWeatherHistoryBounds } from '../features/weather/hooks/useWeatherHistoryBounds.ts';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import type { TableColumnsType } from 'antd';
import { Card, DatePicker, Flex, Segmented, Space, Table } from 'antd';
import { CalendarDays, History, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { farmQueries } from '../api/farm/farm.queries.ts';
import { weatherQueries } from '../api/weather/weather.queries.ts';
import { ForecastPanel } from '../features/weather/components/ForecastPanel';
import { HistoryChart } from '../features/weather/components/HistoryChart';
import { WeatherDayDetails } from '../features/weather/components/WeatherDayDetails';
import { WeatherHistorySummary } from '../features/weather/components/WeatherHistorySummary';
import { WeatherMetricTabs } from '../features/weather/components/WeatherMetricTabs';
import { WeatherSource } from '../features/weather/components/WeatherSource';
import { WeatherStatus } from '../features/weather/components/WeatherStatus';
import { historyRanges } from '../features/weather/constants/weather.constants.ts';
import { useWeatherSelection } from '../features/weather/hooks/useWeatherSelection.ts';
import {
  formatWeatherDate,
  formatWeatherValue,
  selectWeatherReading,
  windDirection,
} from '../features/weather/utils/weatherPresentation.ts';
import type {
  WeatherMetric,
  WeatherRecord,
  WeatherSeries,
} from '../types/weather/weather.types.ts';

export function HistoryPage() {
  const { t } = useTranslation();
  const { data: preferences } = useSuspenseQuery(farmQueries.profile());
  const [metric, setMetric] = useState<WeatherMetric>('temperature');

  return (
    <div className="environment-page">
      <header className="environment-page-heading">
        <div>
          <h1>{t('Environment')}</h1>
          <p>{t('Weather and growing conditions')}</p>
        </div>
        <span>
          <MapPin size={15} />
          {preferences.location || t('My farm')}
        </span>
      </header>
      <WeatherMetricTabs metric={metric} onChange={setMetric} />
      <ForecastPanel metric={metric} showNow />
      <HistoricalWeather metric={metric} />
    </div>
  );
}

type HistoricalWeatherProps = { metric: WeatherMetric };

function HistoricalWeather({ metric }: HistoricalWeatherProps) {
  const { t } = useTranslation();
  const { data: preferences } = useSuspenseQuery(farmQueries.profile());
  const { range, dates, period, changeRange, changeDates, selectedKey, selectReading } =
    useWeatherSelection();
  const query = useQuery(weatherQueries.history(preferences, period));
  const series = query.data;
  const bounds = useWeatherHistoryBounds(preferences.timeZone);

  return (
    <section className="environment-past" aria-label={t('Past conditions')}>
      <Card
        className="weather-history-card"
        title={
          <span className="weather-section-title">
            <History size={19} />
            {t('Past conditions')}
          </span>
        }
        extra={
          <Flex gap={10} wrap align="center">
            <Segmented<HistoryRange | 'custom'>
              aria-label={t('Weather history time range')}
              options={historyRanges.map((value) => ({ value, label: t(value) }))}
              value={dates ? 'custom' : range}
              onChange={(value) => {
                if (value !== 'custom') {
                  changeRange(value);
                }
              }}
            />
            <DatePicker.RangePicker
              aria-label={t('Historical date range')}
              value={dates}
              onChange={changeDates}
              maxDate={bounds.maxDate}
              minDate={bounds.minDate}
              disabledDate={(date, { from }) =>
                Boolean(from && Math.abs(date.diff(from, 'day')) > 365)
              }
            />
          </Flex>
        }
      >
        {series && series.records.length > 0 && !query.isError ? (
          <HistoryExplorer
            series={series}
            metric={metric}
            selectedKey={selectedKey}
            onSelect={selectReading}
          />
        ) : (
          <WeatherStatus
            hasLocation={preferences.latitude !== null && preferences.longitude !== null}
            pending={query.isLoading}
            error={query.error}
            retry={() => void query.refetch()}
          />
        )}
      </Card>
    </section>
  );
}

type HistoryExplorerProps = {
  series: WeatherSeries;
  metric: WeatherMetric;
  selectedKey: number;
  onSelect: (key: number) => void;
};

function HistoryExplorer({ series, metric, selectedKey, onSelect }: HistoryExplorerProps) {
  const { records, units } = series;
  const selected = selectWeatherReading(records, selectedKey);

  return (
    <>
      <div className="weather-forecast-layout">
        <div className="weather-forecast-main">
          <WeatherHistorySummary records={records} metric={metric} units={units} />
          <HistoryChart
            records={records}
            metric={metric}
            selectedKey={selected.key}
            onSelect={onSelect}
            units={units}
          />
        </div>
        <WeatherDayDetails
          record={selected}
          records={records}
          metric={metric}
          units={units}
          soilDepth={series.soilDepth}
          onSelect={onSelect}
        />
      </div>
      <WeatherSource data={series} />
      <DailyLog series={series} selectedKey={selected.key} onSelect={onSelect} />
    </>
  );
}

type DailyLogProps = {
  series: WeatherSeries;
  selectedKey: number;
  onSelect: (key: number) => void;
};

function DailyLog({ series, selectedKey, onSelect }: DailyLogProps) {
  const { t, i18n } = useTranslation();
  const { records, units } = series;
  const columns: TableColumnsType<WeatherRecord> = [
    {
      title: t('Date'),
      dataIndex: 'date',
      render: (value: string) => formatWeatherDate(value, i18n.resolvedLanguage),
    },
    {
      title: t('Conditions'),
      dataIndex: 'conditions',
      render: (value: string) => {
        return (
          <Space>
            <WeatherConditionIcon conditions={value} size={20} />
            {t(value)}
          </Space>
        );
      },
    },
    {
      title: t('High / low'),
      dataIndex: 'temperature',
      render: (value: number | null, record) =>
        `${formatWeatherValue(value)} / ${formatWeatherValue(record.low, units.temperature)}`,
    },
    {
      title: t('Precipitation'),
      dataIndex: 'rainfall',
      render: (value: number | null) => formatWeatherValue(value, units.rainfall),
    },
    {
      title: t('Humidity'),
      dataIndex: 'humidity',
      render: (value: number | null) => formatWeatherValue(value, '%'),
    },
    {
      title: t('Wind'),
      dataIndex: 'wind',
      render: (value: number | null, record) =>
        `${formatWeatherValue(value, units.wind)} ${windDirection(record.windDirection, t)}`,
    },
  ];

  return (
    <section className="weather-daily-log" aria-label={t('Daily environment log')}>
      <h3 className="weather-section-title">
        <CalendarDays size={18} />
        {t('Daily environment log')}
      </h3>
      <Table<WeatherRecord>
        rowKey="date"
        columns={columns}
        dataSource={records}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
        rowClassName={(record) =>
          record.key === selectedKey ? 'environment-selected-row' : 'clickable-row'
        }
        onRow={(record) => ({ onClick: () => onSelect(record.key) })}
      />
    </section>
  );
}

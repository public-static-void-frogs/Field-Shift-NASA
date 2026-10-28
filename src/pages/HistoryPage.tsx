import { useSuspenseQuery } from '@tanstack/react-query';
import type { TableColumnsType } from 'antd';
import {
  Card,
  ConfigProvider,
  Descriptions,
  Flex,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { CloudRain, CloudSun, Sun } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { weatherQueries } from '../api/weather/weather.queries.ts';
import { HistoryChart } from '../components/weather/HistoryChart';
import { historyRanges, weatherMetrics } from '../features/weather/constants.ts';
import { useFarm } from '../hooks/useFarm.ts';
import type { HistoryRange, WeatherRecord } from '../types/weather/weather.types.ts';
import { type WeatherMetric } from '../types/weather/weather.types.ts';

export function HistoryPage() {
  const { t } = useTranslation();
  const columns: TableColumnsType<WeatherRecord> = [
    {
      title: t('Date'),
      dataIndex: 'date',
      render: (value: string, record) => (
        <Space>
          {value}
          {record.today && <Tag color="success">{t('Today')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('Conditions'),
      dataIndex: 'conditions',
      render: (value: string) => {
        const Icon =
          value === 'Light rain' ? CloudRain : value === 'Partly cloudy' ? CloudSun : Sun;
        return (
          <Space>
            <Icon size={20} className={value === 'Light rain' ? 'rain-icon' : 'sun-icon'} />
            {value}
          </Space>
        );
      },
    },
    {
      title: t('Temperature'),
      dataIndex: 'temperature',
      render: (value: number, record) => `${value}° / ${record.low}°C`,
    },
    {
      title: t('Rainfall'),
      dataIndex: 'rainfall',
      render: (value: number) => t('{{value0}} mm', { value0: value.toFixed(1) }),
    },
    {
      title: t('Humidity'),
      dataIndex: 'humidity',
      render: (value: number) => `${value}%`,
    },
    {
      title: t('Wind'),
      dataIndex: 'wind',
      render: (value: number) => t('{{value0}} km/h SW', { value0: value }),
    },
  ];

  const { preferences } = useFarm();
  const [range, setRange] = useState<HistoryRange>('7 days');
  const [metric, setMetric] = useState<WeatherMetric>('temperature');
  const [selectedKey, setSelectedKey] = useState(0);
  const { data: records } = useSuspenseQuery(weatherQueries.history(range));
  const selected = records.find((record) => record.key === selectedKey) ?? records[0];
  const metricConfig = weatherMetrics[metric];
  const config = {
    ...metricConfig,
    title: t(metricConfig.title),
    description: t(metricConfig.description),
    unit: t(metricConfig.unit),
  };
  const previous = records.find((record) => record.key === selected.key + 1);
  const change = previous ? Number((selected[metric] - previous[metric]).toFixed(1)) : null;

  return (
    <div className="environment-history">
      <section className="environment-explorer" aria-label={t('Environment history explorer')}>
        <Tabs
          className="fields-view-tabs environment-tabs"
          activeKey={metric}
          onChange={(key) => setMetric(key as WeatherMetric)}
          items={Object.entries(weatherMetrics).map(([key, value]) => ({
            key,
            label: t(value.title),
          }))}
        />
        <Card
          className="environment-timeline-card"
          title={config.title}
          extra={
            <Segmented
              aria-label={t('Weather history time range')}
              options={historyRanges.map((value) => ({ value, label: t(value) }))}
              value={range}
              onChange={(value) => {
                setRange(value);
                setSelectedKey(0);
              }}
            />
          }
        >
          <div className="environment-timeline-layout">
            <div className="environment-chart-panel">
              <Typography.Text type="secondary" className="environment-chart-caption">
                {config.description} · {config.unit}
              </Typography.Text>
              <HistoryChart
                records={records}
                metric={metric}
                selectedKey={selected.key}
                onSelect={setSelectedKey}
              />
              <Typography.Text type="secondary" className="environment-chart-hint">
                {t('Hover to preview · Click a point to inspect')}
              </Typography.Text>
            </div>
            <aside
              className="environment-point-panel"
              aria-label={t('Selected weather reading')}
              aria-live="polite"
            >
              <Flex justify="space-between" align="center" gap={8} wrap>
                <Typography.Text strong>{t('Selected reading')}</Typography.Text>
                {selected.key === 0 && <Tag>{t('Latest')}</Tag>}
              </Flex>
              <Select
                className="full-width environment-date-select"
                aria-label={t('Inspect weather date')}
                value={selected.key}
                onChange={setSelectedKey}
                options={records.map((record) => ({ value: record.key, label: record.date }))}
              />
              <Statistic
                title={config.title}
                value={selected[metric]}
                precision={metric === 'rainfall' ? 1 : 0}
                suffix={config.unit}
                styles={{ content: { color: '#303b2c' } }}
              />
              <Typography.Paragraph type="secondary" className="environment-change">
                {change === null
                  ? t('No earlier reading available')
                  : t('{{value0}}{{value1}} {{value2}} from previous day', {
                      value0: change > 0 ? '+' : '',
                      value1: change,
                      value2: config.unit,
                    })}
              </Typography.Paragraph>
              <Tag>{selected.conditions}</Tag>
              <Descriptions
                column={1}
                size="small"
                className="environment-reading-details"
                items={[
                  {
                    key: 'high',
                    label: t('High / low'),
                    children: t('{{value0}}° / {{value1}}°C', {
                      value0: selected.temperature,
                      value1: selected.low,
                    }),
                  },
                  {
                    key: 'rain',
                    label: t('Rainfall'),
                    children: t('{{value0}} mm', { value0: selected.rainfall.toFixed(1) }),
                  },
                  { key: 'moisture', label: t('Soil moisture'), children: `${selected.moisture}%` },
                  { key: 'humidity', label: t('Humidity'), children: `${selected.humidity}%` },
                  {
                    key: 'wind',
                    label: t('Wind'),
                    children: t('{{value0}} km/h SW', { value0: selected.wind }),
                  },
                ]}
              />
            </aside>
          </div>
        </Card>
      </section>
      <Card
        className="history-table"
        title={t('Daily environment log')}
        extra={<Tag>{preferences.farmName}</Tag>}
      >
        <ConfigProvider
          theme={{
            components: {
              Table: {
                headerBg: '#ffffff',
                headerColor: '#314529',
                headerSplitColor: '#dfe5d5',
                headerSortActiveBg: '#ffffff',
                headerSortHoverBg: '#ffffff',
                colorTextDescription: '#627653',
              },
            },
          }}
        >
          <Table<WeatherRecord>
            rowKey="key"
            columns={columns}
            dataSource={records}
            scroll={{ x: 1000 }}
            pagination={
              records.length > 7 ? { pageSize: 10, size: 'small', showSizeChanger: false } : false
            }
            rowClassName={(record) =>
              record.key === selected.key ? 'environment-selected-row' : 'clickable-row'
            }
            onRow={(record) => ({ onClick: () => setSelectedKey(record.key) })}
          />
        </ConfigProvider>
      </Card>
    </div>
  );
}

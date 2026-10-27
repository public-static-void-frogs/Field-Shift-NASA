import { useState } from 'react';
import { Card, ConfigProvider, Descriptions, Flex, Segmented, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { CloudRain, CloudSun, Sun } from 'lucide-react';
import { HistoryChart } from '../components/weather/HistoryChart';
import { historyRanges, weatherHistory, weatherMetrics, type WeatherMetric } from '../data/weather';
import type { HistoryRange, WeatherRecord } from '../data/weather';
import { useFarm } from '../hooks/useFarm';

const columns: TableColumnsType<WeatherRecord> = [
  {
    title: 'Date',
    dataIndex: 'date',
    render: (value: string, record) => (
      <Space>
        {value}
        {record.today && <Tag color="success">Today</Tag>}
      </Space>
    )
  },
  {
    title: 'Conditions',
    dataIndex: 'conditions',
    render: (value: string) => {
      const Icon = value === 'Light rain' ? CloudRain : value === 'Partly cloudy' ? CloudSun : Sun;
      return (
        <Space>
          <Icon size={20} className={value === 'Light rain' ? 'rain-icon' : 'sun-icon'} />
          {value}
        </Space>
      );
    }
  },
  {
    title: 'Temperature',
    dataIndex: 'temperature',
    render: (value: number, record) => `${value}° / ${record.low}°C`
  },
  {
    title: 'Rainfall',
    dataIndex: 'rainfall',
    render: (value: number) => `${value.toFixed(1)} mm`
  },
  {
    title: 'Humidity',
    dataIndex: 'humidity',
    render: (value: number) => `${value}%`
  },
  {
    title: 'Wind',
    dataIndex: 'wind',
    render: (value: number) => `${value} km/h SW`
  },
];

export function HistoryPage() {
  const { preferences } = useFarm();
  const [range, setRange] = useState<HistoryRange>('7 days');
  const [metric, setMetric] = useState<WeatherMetric>('temperature');
  const [selectedKey, setSelectedKey] = useState(0);
  const records = weatherHistory.slice(0, Number.parseInt(range));
  const selected = records.find(record => record.key === selectedKey) ?? records[0];
  const config = weatherMetrics[metric];
  const previous = weatherHistory.find(record => record.key === selected.key + 1);
  const change = previous ? Number((selected[metric] - previous[metric]).toFixed(1)) : null;

  return (
    <div className="environment-history">
      <section className="environment-explorer" aria-label="Environment history explorer">
        <Tabs
          className="fields-view-tabs environment-tabs"
          activeKey={metric}
          onChange={key => setMetric(key as WeatherMetric)}
          items={Object.entries(weatherMetrics).map(([key, value]) => ({ key, label: value.title }))}
        />
        <Card
          className="environment-timeline-card"
          title={config.title}
          extra={<Segmented aria-label="Weather history time range" options={[...historyRanges]} value={range} onChange={value => {
            setRange(value);
            setSelectedKey(0);
          }} />}
        >
          <div className="environment-timeline-layout">
            <div className="environment-chart-panel">
              <Typography.Text type="secondary" className="environment-chart-caption">{config.description} · {config.unit}</Typography.Text>
              <HistoryChart records={records} metric={metric} selectedKey={selected.key} onSelect={setSelectedKey} />
              <Typography.Text type="secondary" className="environment-chart-hint">Hover to preview · Click a point to inspect</Typography.Text>
            </div>
            <aside className="environment-point-panel" aria-label="Selected weather reading" aria-live="polite">
              <Flex justify="space-between" align="center" gap={8} wrap>
                <Typography.Text strong>Selected reading</Typography.Text>
                {selected.key === 0 && <Tag>Latest</Tag>}
              </Flex>
              <Select
                className="full-width environment-date-select"
                aria-label="Inspect weather date"
                value={selected.key}
                onChange={setSelectedKey}
                options={records.map(record => ({ value: record.key, label: record.date }))}
              />
              <Statistic title={config.title} value={selected[metric]} precision={metric === 'rainfall' ? 1 : 0} suffix={config.unit} styles={{ content: { color: '#303b2c' } }} />
              <Typography.Paragraph type="secondary" className="environment-change">
                {change === null ? 'No earlier reading available' : `${change > 0 ? '+' : ''}${change} ${config.unit} from previous day`}
              </Typography.Paragraph>
              <Tag>{selected.conditions}</Tag>
              <Descriptions column={1} size="small" className="environment-reading-details" items={[
                { key: 'high', label: 'High / low', children: `${selected.temperature}° / ${selected.low}°C` },
                { key: 'rain', label: 'Rainfall', children: `${selected.rainfall.toFixed(1)} mm` },
                { key: 'moisture', label: 'Soil moisture', children: `${selected.moisture}%` },
                { key: 'humidity', label: 'Humidity', children: `${selected.humidity}%` },
                { key: 'wind', label: 'Wind', children: `${selected.wind} km/h SW` },
              ]} />
            </aside>
          </div>
        </Card>
      </section>
      <Card className="history-table" title="Daily environment log" extra={<Tag>{preferences.farmName}</Tag>}>
        <ConfigProvider theme={{ components: { Table: {
          headerBg: '#ffffff',
          headerColor: '#314529',
          headerSplitColor: '#dfe5d5',
          headerSortActiveBg: '#ffffff',
          headerSortHoverBg: '#ffffff',
          colorTextDescription: '#627653',
        } } }}>
          <Table<WeatherRecord>
            rowKey="key"
            columns={columns}
            dataSource={records}
            scroll={{ x: 1000 }}
            pagination={records.length > 7 ? { pageSize: 10, size: 'small', showSizeChanger: false } : false}
            rowClassName={record => record.key === selected.key ? 'environment-selected-row' : 'clickable-row'}
            onRow={record => ({ onClick: () => setSelectedKey(record.key) })}
          />
        </ConfigProvider>
      </Card>
    </div>
  );
}

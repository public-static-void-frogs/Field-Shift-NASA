import { useState } from 'react';
import { Card, Flex, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { CloudRain, CloudSun, Sun } from 'lucide-react';
import { PageHeading } from '../components/common/PageHeading';
import { HistoryChart } from '../components/weather/HistoryChart';
import { WeatherCard } from '../components/weather/WeatherCard';
import { historyRanges, weatherHistory } from '../data/weather';
import type { HistoryRange, WeatherRecord } from '../data/weather';
import type { Navigate } from '../types/navigation';

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

export function HistoryPage({ navigate }: { navigate: Navigate; }) {
  const [range, setRange] = useState<HistoryRange>('7 days');
  const records = weatherHistory.slice(0, Number.parseInt(range));
  return (
    <>
      <PageHeading
        title="Know what’s behind the growth."
        description="Weather, soil, and environmental conditions across your farm."
      />
      <div className="history-current">
        <div>
          <Typography.Text className="eyebrow">CURRENT CONDITIONS · GREEN VALLEY FARM</Typography.Text>
          <Typography.Title level={2}>
            <Sun size={34} className="sun-icon" />
            24°C · Mostly sunny
          </Typography.Title>
          <Typography.Paragraph type="secondary">Good conditions for field work. Light rain expected Thursday.</Typography.Paragraph>
          <Flex gap={24} wrap>
            <span>
              Humidity
              <strong>62%</strong>
            </span>
            <span>
              Wind
              <strong>12 km/h SW</strong>
            </span>
            <span>
              UV index
              <strong>6 · High</strong>
            </span>
          </Flex>
        </div>
        <WeatherCard navigate={navigate} />
      </div>
      <Flex
        className="history-toolbar"
        justify="space-between"
        align="center"
        gap={16}
        wrap
      >
        <Typography.Title level={3} className="no-margin">Conditions over time</Typography.Title>
        <Segmented
          options={[...historyRanges]}
          value={range}
          onChange={setRange}
        />
      </Flex>
      <div className="history-charts">
        <HistoryChart
          records={records}
          metric="temperature"
          title="Air temperature"
          unit="°C"
          color="#b8954d"
        />
        <HistoryChart
          records={records}
          metric="rainfall"
          title="Rainfall"
          unit="mm"
          color="#6c94a0"
        />
        <HistoryChart
          records={records}
          metric="moisture"
          title="Soil moisture"
          unit="%"
          color="#799763"
        />
      </div>
      <Card
        className="history-table"
        title="Daily environment log"
        extra={<Tag color="success">Green Valley Farm</Tag>}
      >
        <Table<WeatherRecord>
          columns={columns}
          dataSource={records}
          scroll={{ x: 1000 }}
          pagination={records.length > 7 ? { pageSize: 10, showSizeChanger: false } : false}
        />
      </Card>
    </>
  );
}

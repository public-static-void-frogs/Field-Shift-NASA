import { Button, Card, Divider, Flex, Space, Statistic, Typography } from 'antd';
import { ArrowRight, CloudRain, CloudSun, Droplets, MapPin, Sun, Wind } from 'lucide-react';
import type { Navigate } from '../../types/navigation';

const forecast = [
  {
    day: 'Today',
    temperature: 24,
    icon: Sun
  },
  {
    day: 'Mon',
    temperature: 26,
    icon: Sun
  },
  {
    day: 'Tue',
    temperature: 22,
    icon: CloudSun
  },
  {
    day: 'Wed',
    temperature: 23,
    icon: CloudSun
  },
  {
    day: 'Thu',
    temperature: 19,
    icon: CloudRain
  },
];

export function WeatherCard({ navigate }: { navigate: Navigate; }) {
  return (
    <Card
      className="weather-card"
      title="Weather today"
      extra={<Space className="location-text">
        <MapPin size={16} />
        Iowa, US
      </Space>}
    >
      <Flex
        align="center"
        justify="space-between"
        gap={16}
      >
        <div>
          <Statistic value={24} suffix="°C" />
          <Typography.Paragraph>Mostly sunny</Typography.Paragraph>
          <Typography.Text type="secondary">Feels like 26° · H 27° / L 16°</Typography.Text>
        </div>
        <Sun
          size={72}
          strokeWidth={1.2}
          className="sun-icon"
        />
      </Flex>
      <Divider />
      <div className="weather-metrics">
        <div>
          <Droplets size={19} />
          <strong>62%</strong>
          <Typography.Text type="secondary">Humidity</Typography.Text>
        </div>
        <div>
          <Wind size={19} />
          <strong>12 km/h</strong>
          <Typography.Text type="secondary">Wind · SW</Typography.Text>
        </div>
        <div>
          <CloudRain size={19} />
          <strong>10%</strong>
          <Typography.Text type="secondary">Rain chance</Typography.Text>
        </div>
      </div>
      <Divider />
      <div className="forecast">
        {forecast.map(({ day, temperature, icon: Icon }) => (
          <div key={day}>
            <Typography.Text type="secondary">
              {day}
            </Typography.Text>
            <Icon size={27} className={day === 'Thu' ? 'rain-icon' : 'sun-icon'} />
            <strong>
              {temperature}
              °
            </strong>
          </div>
        ))}
      </div>
      <Button
        type="link"
        className="card-link"
        onClick={() => navigate('/history')}
      >
        View weather history
        <ArrowRight size={18} />
      </Button>
    </Card>
  );
}

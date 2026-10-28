import { useSuspenseQuery } from '@tanstack/react-query';
import { Card, Divider, Flex, Space, Statistic, Typography } from 'antd';
import { ArrowRight, CloudRain, CloudSun, Droplets, MapPin, Sun, Wind } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { weatherQueries } from '../../api/weather/weather.queries.ts';
import { RouterButton } from '../common/RouterButton';

const weatherIcons = { sunny: Sun, cloudy: CloudSun, rain: CloudRain };

export function WeatherCard() {
  const { t } = useTranslation();
  const { data: weather } = useSuspenseQuery(weatherQueries.current());
  const WeatherIcon = weatherIcons[weather.condition];
  return (
    <Card
      className="weather-card"
      title={t('Weather today')}
      extra={
        <Space className="location-text">
          <MapPin size={16} />
          {weather.location}
        </Space>
      }
    >
      <Flex align="center" justify="space-between" gap={16}>
        <div>
          <Statistic value={weather.temperature} suffix="°C" />
          <Typography.Paragraph>{t(weather.conditions)}</Typography.Paragraph>
          <Typography.Text type="secondary">
            {t('Feels like {{feelsLike}}° · H {{high}}° / L {{low}}°', {
              feelsLike: weather.feelsLike,
              high: weather.high,
              low: weather.low,
            })}
          </Typography.Text>
        </div>
        <WeatherIcon size={72} strokeWidth={1.2} className="sun-icon" />
      </Flex>
      <Divider />
      <div className="weather-metrics">
        <div>
          <Droplets size={19} />
          <strong>{weather.humidity}%</strong>
          <Typography.Text type="secondary">{t('Humidity')}</Typography.Text>
        </div>
        <div>
          <Wind size={19} />
          <strong>{t('{{value0}} km/h', { value0: weather.wind })}</strong>
          <Typography.Text type="secondary">{t('Wind · SW')}</Typography.Text>
        </div>
        <div>
          <CloudRain size={19} />
          <strong>{weather.rainChance}%</strong>
          <Typography.Text type="secondary">{t('Rain chance')}</Typography.Text>
        </div>
      </div>
      <Divider />
      <div className="forecast">
        {weather.forecast.map(({ day, temperature, condition }) => {
          const Icon = weatherIcons[condition];
          return (
            <div key={day}>
              <Typography.Text type="secondary">{t(day)}</Typography.Text>
              <Icon size={27} className={condition === 'rain' ? 'rain-icon' : 'sun-icon'} />
              <strong>{temperature}°</strong>
            </div>
          );
        })}
      </div>
      <RouterButton type="link" className="card-link" to="/history">
        {t('View weather history')} <ArrowRight size={18} />
      </RouterButton>
    </Card>
  );
}

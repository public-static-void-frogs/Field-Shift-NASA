import { Card, Space, Typography } from 'antd';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WeatherRecord, WeatherUnits } from '../../../types/weather/weather.types.ts';
import { getWeatherDayInsight } from '../utils/weatherDayInsight.ts';
import { formatWeatherValue } from '../utils/weatherPresentation.ts';

type WeatherDayInsightProps = { record: WeatherRecord; units: WeatherUnits };

export function WeatherDayInsight({ record, units }: WeatherDayInsightProps) {
  const { t } = useTranslation();
  const insight = getWeatherDayInsight(record, units);
  const facts: string[] = [];
  if (record.weatherCode !== null) {
    facts.push(t('Conditions: {{conditions}}.', { conditions: t(record.conditions) }));
  }
  if (record.temperature !== null && record.low !== null) {
    facts.push(
      t('A high of {{high}} and a low of {{low}} are forecast.', {
        high: formatWeatherValue(record.temperature, units.temperature),
        low: formatWeatherValue(record.low, units.temperature),
      }),
    );
  } else if (record.temperature !== null) {
    facts.push(
      t('The daytime high is {{value}}.', {
        value: formatWeatherValue(record.temperature, units.temperature),
      }),
    );
  } else if (record.low !== null) {
    facts.push(
      t('The overnight low is {{value}}.', {
        value: formatWeatherValue(record.low, units.temperature),
      }),
    );
  }
  if (record.rainChance !== null && record.rainfall !== null) {
    facts.push(
      t('Rain chance is {{chance}}, with {{amount}} of precipitation expected.', {
        chance: formatWeatherValue(record.rainChance, '%'),
        amount: formatWeatherValue(record.rainfall, units.rainfall),
      }),
    );
  } else if (record.rainChance !== null) {
    facts.push(
      t('Rain chance is {{value}}.', {
        value: formatWeatherValue(record.rainChance, '%'),
      }),
    );
  } else if (record.rainfall !== null) {
    facts.push(
      t('Expected precipitation is {{value}}.', {
        value: formatWeatherValue(record.rainfall, units.rainfall),
      }),
    );
  }
  if (record.wind !== null) {
    facts.push(
      t('Wind is forecast at {{value}}.', {
        value: formatWeatherValue(record.wind, units.wind),
      }),
    );
  }

  return (
    <Card
      className="ai-insight-card weather-day-insight"
      title={
        <Space>
          <Sparkles size={21} className="ai-insight-sparkle" aria-hidden="true" />
          {t('Your day, explained')}
        </Space>
      }
    >
      <Typography.Title level={3}>{t(insight.title)}</Typography.Title>
      {facts.length > 0 && <Typography.Paragraph>{facts.join(' ')}</Typography.Paragraph>}
      <Typography.Paragraph>{t(insight.message)}</Typography.Paragraph>
      <Typography.Text className="weather-insight-caption" type="secondary">
        {t('Based on the selected day’s forecast.')}
      </Typography.Text>
    </Card>
  );
}

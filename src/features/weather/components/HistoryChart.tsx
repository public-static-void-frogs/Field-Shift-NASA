import { useTranslation } from 'react-i18next';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  WeatherMetric,
  WeatherRecord,
  WeatherUnits,
} from '../../../types/weather/weather.types.ts';
import { formatWeatherValue } from '../utils/weatherPresentation.ts';
import { summarizeWeather, weatherColor } from '../utils/weatherVisuals.ts';
import { useHistoryChart } from '../hooks/useHistoryChart.ts';
import { WeatherChartTooltip } from './WeatherChartTooltip';

type HistoryChartProps = {
  records: WeatherRecord[];
  metric: WeatherMetric;
  selectedKey: number;
  onSelect: (key: number) => void;
  units: WeatherUnits;
  forecast?: boolean;
};

export function HistoryChart({
  records,
  metric,
  selectedKey,
  onSelect,
  units,
  forecast = false,
}: HistoryChartProps) {
  const { t, i18n } = useTranslation();
  const { gradientId, animate, config, timeline, selected, selectPoint } = useHistoryChart({
    records,
    metric,
    selectedKey,
    onSelect,
    units,
    forecast,
  });
  const summary = summarizeWeather(records, metric);
  const readingColor = weatherColor(summary?.average ?? null, metric, units);
  const strokeId = `${gradientId}-stroke`;
  let domain: [number | string, number | string] = ['auto', 'auto'];
  if (metric === 'rainfall' || metric === 'moisture' || metric === 'wind') {
    domain = [0, 'auto'];
  }
  if (metric === 'humidity') {
    domain = [0, 100];
  }
  const forecastDash = forecast ? '6 3' : undefined;
  const today = records.find((record) => record.today);

  function barLabel(value: unknown) {
    if (typeof value !== 'number' || value === 0) {
      return '';
    }
    return formatWeatherValue(value);
  }

  function dateLabel(value: string) {
    const record = records.find((item) => item.date === value);
    if (record?.today) {
      return t('Today');
    }
    return new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`));
  }

  return (
    <div className={`weather-trend-chart ${forecast ? 'weather-trend-forecast' : ''}`}>
      <div className="weather-chart-unit">{config.unit}</div>
      <div
        className="environment-chart"
        role="group"
        aria-label={t('{{value0}} timeline. Hover to preview a reading, click to select it.', {
          value0: config.title,
        })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={timeline}
            margin={{ top: 30, right: 20, bottom: 4, left: 0 }}
            accessibilityLayer
            onClick={selectPoint}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={readingColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={readingColor} stopOpacity={0.015} />
              </linearGradient>
              <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
                {timeline.map((record, index) => (
                  <stop
                    key={record.date}
                    offset={`${(index / Math.max(1, timeline.length - 1)) * 100}%`}
                    stopColor={weatherColor(record[metric], metric, units)}
                  />
                ))}
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e9eee5" strokeDasharray="3 5" />
            <XAxis
              dataKey="date"
              tickFormatter={dateLabel}
              tick={{ fill: '#63715a', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
              dy={10}
            />
            <YAxis
              yAxisId="value"
              domain={domain}
              tick={{ fill: '#63715a', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={38}
              tickCount={4}
              tickFormatter={(value) => formatWeatherValue(Number(value))}
            />
            {metric === 'rainfall' && forecast && (
              <YAxis
                yAxisId="chance"
                orientation="right"
                domain={[0, 100]}
                unit="%"
                tick={{ fontSize: 13, fill: '#63715a' }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
            )}
            <Tooltip
              content={<WeatherChartTooltip metric={metric} units={units} />}
              cursor={{ stroke: '#a7b59d', strokeDasharray: '4 4' }}
            />
            {summary && metric !== 'rainfall' && (
              <ReferenceLine
                yAxisId="value"
                y={Number(summary.average.toFixed(1))}
                stroke="#b8c2af"
                strokeDasharray="4 6"
              />
            )}
            {metric === 'rainfall' ? (
              <Bar
                yAxisId="value"
                dataKey="rainfall"
                name={config.title}
                radius={[5, 5, 0, 0]}
                maxBarSize={38}
                isAnimationActive={animate}
              >
                {timeline.map((record) => (
                  <Cell key={record.date} fill={weatherColor(record.rainfall, metric, units)} />
                ))}
                {timeline.length <= 14 && (
                  <LabelList
                    dataKey="rainfall"
                    position="top"
                    fill="#4c6d7a"
                    fontSize={13}
                    formatter={barLabel}
                  />
                )}
              </Bar>
            ) : (
              <Area
                yAxisId="value"
                key={metric}
                type="monotone"
                dataKey={metric}
                name={config.title}
                stroke={`url(#${strokeId})`}
                strokeWidth={3}
                strokeDasharray={forecastDash}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 3 }}
                connectNulls={false}
                isAnimationActive={animate}
                animationDuration={450}
              />
            )}
            {metric === 'temperature' && (
              <Line
                yAxisId="value"
                type="monotone"
                dataKey="low"
                name={t('Daily low')}
                stroke="#9bb9c7"
                strokeWidth={1.5}
                strokeDasharray="3 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={animate}
              />
            )}
            {metric === 'rainfall' && forecast && (
              <Line
                yAxisId="chance"
                type="monotone"
                dataKey="rainChance"
                name={t('Rain chance')}
                stroke="#5f8165"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={animate}
              />
            )}
            {today && (
              <ReferenceLine
                yAxisId="value"
                x={today.date}
                stroke="#739766"
                strokeWidth={2}
                label={{
                  value: t('Today'),
                  position: 'insideTopLeft',
                  fill: '#476b3c',
                  fontSize: 13,
                }}
              />
            )}
            <ReferenceLine
              yAxisId="value"
              x={selected.date}
              stroke={config.color}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
            {summary && metric !== 'rainfall' && summary.high[metric] !== summary.low[metric] && (
              <ReferenceDot
                yAxisId="value"
                x={summary.high.date}
                y={summary.high[metric]!}
                r={3}
                fill={readingColor}
                stroke="white"
                label={{
                  value: formatWeatherValue(summary.high[metric], config.unit),
                  position: 'top',
                  fill: '#4a5a40',
                  fontSize: 13,
                }}
              />
            )}
            {selected[metric] !== null && (
              <ReferenceDot
                yAxisId="value"
                x={selected.date}
                y={selected[metric]}
                r={5}
                fill={readingColor}
                stroke="#fff"
                strokeWidth={2}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="weather-chart-legend">
        <span>
          <i className="weather-legend-line" style={{ background: readingColor }} />
          {config.title}
        </span>
        {metric === 'temperature' && (
          <span>
            <i className="weather-legend-low" />
            {t('Daily low')}
          </span>
        )}
        {metric === 'rainfall' && forecast && (
          <span>
            <i className="weather-legend-low" />
            {t('Rain chance')} %
          </span>
        )}
        {summary && (
          <span className="weather-average-label">
            {t('Average')} <strong>{formatWeatherValue(summary.average, config.unit)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

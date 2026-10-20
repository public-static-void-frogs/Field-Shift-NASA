import { useId } from 'react';
import { Card, Statistic, Typography } from 'antd';
import type { WeatherRecord } from '../../data/weather';

type MetricKey = 'temperature' | 'rainfall' | 'moisture';

export function HistoryChart({ records, metric, title, unit, color }: { records: WeatherRecord[]; metric: MetricKey; title: string; unit: string; color: string; }) {
  const gradientId = useId();
  const values = [...records].reverse().map(record => record[metric]);
  const max = Math.max(...values) * 1.2 || 1;
  const points = values.map((value, index) => `${index * 400 / Math.max(values.length - 1, 1)},${120 - value / max * 105}`).join(' ');
  const total = values.reduce((sum, value) => sum + value, 0);
  const value = metric === 'rainfall' ? total : total / values.length;
  return (
    <Card className="chart-card">
      <Statistic
        title={title}
        value={value.toFixed(1)}
        suffix={unit}
      />
      <Typography.Text type="secondary">
        {metric === 'rainfall' ? 'Total rainfall' : 'Average'}
        over the last
        {records.length}
        days
      </Typography.Text>
      <svg
        viewBox="0 0 400 140"
        role="img"
        aria-label={`${title} over ${records.length} days`}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop stopColor={color} stopOpacity=".2" />
            <stop
              offset="100%"
              stopColor={color}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        {[30, 70, 110].map(y => (
          <path
            key={y}
            d={`M0 ${y}H400`}
            stroke="#e5eadc"
            strokeDasharray="4 4"
          />
        ))}
        <polygon points={`0,140 ${points} 400,140`} fill={`url(#${gradientId})`} />
        <polyline
          points={points}
          stroke={color}
          fill="none"
          strokeWidth="2.5"
        />
      </svg>
      <div className="chart-axis">
        <span>
          {records.at(-1)?.date.replace(', 2026', '')}
        </span>
        <span>May 24</span>
      </div>
    </Card>
  );
}

import { useTranslation } from 'react-i18next';
import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { weatherMetrics, type WeatherMetric, type WeatherRecord } from '../../data/weather';

export function HistoryChart({ records, metric, selectedKey, onSelect }: { records: WeatherRecord[]; metric: WeatherMetric; selectedKey: number; onSelect: (key: number) => void }) {
  const { t } = useTranslation();
  const gradientId = useId();
  const [animate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const metricConfig = weatherMetrics[metric];
  const config = { ...metricConfig, title: t(metricConfig.title), description: t(metricConfig.description), unit: t(metricConfig.unit) };
  const timeline = [...records].reverse();
  const selected = records.find(record => record.key === selectedKey) ?? records[0];

  return <div className="environment-chart" role="group" aria-label={t('{{value0}} timeline. Hover to preview a reading, click to select it.', { value0: config.title })}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={timeline}
        margin={{ top: 24, right: 18, bottom: 12, left: 0 }}
        accessibilityLayer
        onClick={state => {
          if (state.activeTooltipIndex === undefined || state.activeTooltipIndex === null) return;
          const record = timeline[Number(state.activeTooltipIndex)];
          if (record) onSelect(record.key);
        }}
      >
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={config.color} stopOpacity={.24} />
          <stop offset="100%" stopColor={config.color} stopOpacity={.02} />
        </linearGradient></defs>
        <CartesianGrid vertical={false} stroke="#e5eadc" />
        <XAxis dataKey="date" tickFormatter={date => String(date).replace(', 2026', '')} tick={{ fill: '#707d65', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={36} dy={8} />
        <YAxis domain={metric === 'humidity' || metric === 'moisture' ? [0, 100] : [0, 'auto']} tick={{ fill: '#707d65', fontSize: 12 }} tickFormatter={value => `${value}${config.unit === '%' ? '%' : ''}`} axisLine={false} tickLine={false} width={42} />
        <Tooltip
          contentStyle={{ background: '#fff', border: '1px solid #dfe5d5', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 20px #303b2c12' }}
          formatter={value => [`${value} ${config.unit}`, config.title]}
          cursor={{ stroke: '#a0b38c', strokeWidth: 1 }}
        />
        <Area
          key={metric}
          type={metric === 'rainfall' ? 'stepAfter' : 'monotone'}
          dataKey={metric}
          name={config.title}
          stroke={config.color}
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
          isAnimationActive={animate}
          animationDuration={650}
        />
        <ReferenceLine x={selected.date} stroke={config.color} strokeDasharray="4 4" strokeOpacity={.55} />
        <ReferenceDot x={selected.date} y={selected[metric]} r={5} fill={config.color} stroke="#fff" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Card, Empty, Flex, Segmented, Select, Skeleton, Tag, Typography } from 'antd';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFarm } from '../../hooks/useFarm';
import { chartColors, getCropAreas, getSampleFieldTrends } from '../../data/overviewCharts';

const axis = { fill: '#707d65', fontSize: 12 };
const tooltipStyle = { border: '1px solid #dfe5d5', borderRadius: 8, background: '#fff', color: '#303b2c', boxShadow: '0 4px 20px #303b2c12', fontSize: 13 };

function ChartCard({ title, controls, children, className = '' }: { title: string; controls?: ReactNode; children: (animate: boolean) => ReactNode; className?: string }) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [animate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '0px 0px 40px 0px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className={`overview-chart ${className}`}>
    <Card title={<Flex align="center" gap={10} wrap>{title}<Tag>{t('Sample data')}</Tag></Flex>} extra={controls}>
      {visible ? children(animate) : <div className="overview-chart-canvas"><Skeleton active paragraph={{ rows: 5 }} /></div>}
    </Card>
  </div>;
}

export function OverviewCharts() {
  const { t } = useTranslation();
  const { fields } = useFarm();
  const [days, setDays] = useState(30);
  const [trendMetric, setTrendMetric] = useState<'health' | 'moisture'>('health');
  const [hiddenFields, setHiddenFields] = useState<number[]>([]);
  const [crop, setCrop] = useState<string | null>(null);
  const [barMetric, setBarMetric] = useState<'health' | 'moisture'>('health');
  const cropAreas = getCropAreas(fields);
  const totalArea = cropAreas.reduce((sum, item) => sum + item.area, 0);
  const activeCrop = cropAreas.some(item => item.name === crop) ? crop : null;
  const trendData = getSampleFieldTrends(fields, days, trendMetric);
  const percent = (value: unknown) => `${value}%`;

  return <section className="overview-charts" aria-label={t('Field analytics with illustrative sample data')}>
    <ChartCard
      title={t('Field conditions over time')}
      className="overview-chart-wide"
      controls={<Flex gap={8} wrap>
        <Select aria-label={t('Trend metric')} value={trendMetric} onChange={setTrendMetric} options={[{ value: 'health', label: t('Crop health') }, { value: 'moisture', label: t('Soil moisture') }]} />
        <Segmented aria-label={t('Trend time range')} value={days} onChange={setDays} options={[{ value: 30, label: t('30 days') }, { value: 90, label: t('90 days') }]} />
      </Flex>}
    >{animate => fields.length ? <>
      <div className="overview-chart-canvas overview-line-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#e9edE2" />
            <XAxis dataKey="date" tick={axis} axisLine={false} tickLine={false} minTickGap={32} dy={8} />
            <YAxis domain={[0, 100]} tick={axis} axisLine={false} tickLine={false} tickFormatter={percent} width={44} />
            <Tooltip contentStyle={tooltipStyle} formatter={percent} cursor={{ stroke: '#a8b99a', strokeWidth: 1 }} />
            {fields.map((field, index) => <Line
              key={field.id}
              name={field.name}
              dataKey={`field-${field.id}`}
              type="monotone"
              stroke={chartColors[index % chartColors.length]}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
              hide={hiddenFields.includes(field.id)}
              isAnimationActive={animate}
              animationDuration={850}
            />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Flex gap={8} wrap className="chart-series-controls" aria-label={t('Toggle fields in trend chart')}>
        {fields.map((field, index) => <button
          key={field.id}
          type="button"
          className="chart-series-button"
          aria-pressed={!hiddenFields.includes(field.id)}
          onClick={() => setHiddenFields(current => current.includes(field.id) ? current.filter(id => id !== field.id) : [...current, field.id])}
        ><span style={{ background: chartColors[index % chartColors.length] }} />{field.name}</button>)}
      </Flex>
    </> : <Empty description={t('Add a field to see sample trends.')} />}</ChartCard>

    <ChartCard title={t('Area by crop')}>{animate => cropAreas.length ? <>
      <div className="overview-chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Pie
              data={cropAreas}
              dataKey="area"
              nameKey="name"
              outerRadius="85%"
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={3}
              onClick={entry => {
                if (typeof entry.name === 'string') {
                  const name = entry.name;
                  setCrop(current => current === name ? null : name);
                }
              }}
              isAnimationActive={animate}
              animationBegin={0}
              animationDuration={850}
            >{cropAreas.map(item => <Cell key={item.name} fill={item.fill} opacity={!activeCrop || activeCrop === item.name ? 1 : .3} cursor="pointer" />)}</Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value} ha · ${Math.round(Number(value) / totalArea * 100)}%`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <Flex gap={8} wrap className="chart-series-controls" aria-label={t('Select crop area')}>
        {cropAreas.map(item => <button key={item.name} type="button" className="chart-series-button" aria-pressed={!activeCrop || activeCrop === item.name} onClick={() => setCrop(current => current === item.name ? null : item.name)}>
          <span style={{ background: item.fill }} />{item.name}<strong>{item.area}  {t('ha')}</strong>
        </button>)}
      </Flex>
    </> : <Empty description={t('Add a field to compare crop areas.')} />}</ChartCard>

    <ChartCard title={t('Conditions by field')} controls={<Select aria-label={t('Field comparison metric')} value={barMetric} onChange={setBarMetric} options={[{ value: 'health', label: t('Crop health') }, { value: 'moisture', label: t('Soil moisture') }]} />}>{animate => fields.length ? <>
      <div className="overview-chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={fields} layout="vertical" margin={{ top: 10, right: 24, bottom: 8, left: 0 }} accessibilityLayer>
            <CartesianGrid horizontal={false} stroke="#e9ede2" />
            <XAxis type="number" domain={[0, 100]} tick={axis} axisLine={false} tickLine={false} tickFormatter={percent} />
            <YAxis type="category" dataKey="name" width={108} tick={axis} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={percent} cursor={{ fill: '#f3f6ed' }} />
            <Bar dataKey={barMetric} name={barMetric === 'health' ? 'Crop health' : 'Soil moisture'} radius={[0, 5, 5, 0]} maxBarSize={24} isAnimationActive={animate} animationDuration={850}>
              {fields.map((field, index) => <Cell key={field.id} fill={chartColors[index % chartColors.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Typography.Text type="secondary" className="chart-footnote">{t('Hover or focus a bar to inspect its value.')}</Typography.Text>
    </> : <Empty description={t('Add a field to compare conditions.')} />}</ChartCard>
  </section>;
}

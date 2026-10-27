import { useState } from 'react';
import { Button, Card, Descriptions, Result, Space, Steps, Table, Tag, Typography } from 'antd';
import { ArrowLeft, ArrowUpRight, CalendarDays, Sparkles } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { PageHeading } from '../components/common/PageHeading';
import { EventResponseControls } from '../components/calendar/EventResponseControls';
import { useFarm } from '../hooks/useFarm';
import { getFieldStrategy } from '../data/fieldStrategy';
import { calendarEventPath, calendarPath } from '../data/planning';
import { formatPlanDate } from '../utils/planningDates';
import { getEventDecision } from '../utils/eventResponses';
import type { PlannedEvent } from '../types/planning';
import type { Navigate } from '../types/navigation';

const tooltipStyle = { border: '1px solid #dfe5d5', borderRadius: 8, background: '#fff', fontSize: 13 };
const axis = { fill: '#707d65', fontSize: 12 };
const forecastMetrics = [
  { title: 'Crop health improvement', currentKey: 'currentHealth', projectedKey: 'health', gainKey: 'healthImprovement', color: '#476b3c', unit: '/100', deltaUnit: 'points', description: 'Projected crop health after the recommended checks and rotation. The dashed line keeps today’s reading as a reference.' },
  { title: 'Soil moisture outlook', currentKey: 'currentMoisture', projectedKey: 'moisture', gainKey: 'moistureImprovement', color: '#345865', unit: '%', deltaUnit: 'pp', description: 'Projected moisture adjustment toward the sample target of 55%. Improvement means moving toward the target, rather than always increasing moisture.' },
] as const;

export function FieldStrategyPage({ fieldId, navigate }: { fieldId: number; navigate: Navigate }) {
  const { fields, eventResponses } = useFarm();
  const [animate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const field = fields.find(item => item.id === fieldId);
  if (!field) return <Result status="404" title="Field not found" extra={<Button onClick={() => navigate('/fields')}>Back to fields</Button>} />;
  const { plan, events, steps, forecast, comparison, technicals, contingencies } = getFieldStrategy(field);
  const counts = events.reduce((totals, event) => {
    totals[getEventDecision(event, eventResponses)]++;
    return totals;
  }, { proposed: 0, accepted: 0, declined: 0 });

  return <div className="strategy-page">
    <Button type="text" icon={<ArrowLeft size={18} />} onClick={() => navigate(`/fields/${field.id}`)}>Back to {field.name}</Button>
    <PageHeading
      eyebrow={`${field.name.toUpperCase()} · FIELD STRATEGY`}
      title={`${plan.nextCrop} rotation strategy`}
      description={`${field.crop} → ${plan.nextCrop} → ${plan.followingCrop} · 2026–2028 outlook`}
      actions={<Space wrap><Button onClick={() => document.getElementById('strategy-calendar-proposals')?.scrollIntoView({ behavior: animate ? 'smooth' : 'instant', block: 'start' })}>Review proposed events</Button><Button icon={<CalendarDays size={18} />} href={`#${calendarPath(plan.sowingDate, field.id)}`}>Open field calendar</Button></Space>}
    />
    <div className="strategy-sections">
      <Card className="ai-insight-card strategy-summary" title={<Space><Sparkles size={20} className="ai-insight-sparkle" />Model recommendation</Space>} extra={<Tag className="ai-insight-tag">DEMO MODEL OUTPUT</Tag>}>
        <Typography.Paragraph>{plan.reasons[0]}</Typography.Paragraph>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} items={[
          { key: 'planting', label: 'Planting begins', children: formatPlanDate(plan.sowingDate) },
          { key: 'window', label: 'Window ends', children: formatPlanDate(plan.windowEnd) },
          { key: 'confidence', label: 'Model score', children: `${plan.confidence}% · illustrative` },
        ]} />
        <Typography.Paragraph type="secondary" className="strategy-demo-note">Draft strategy from the app’s sample model data. Forecasts and model scores illustrate the product; they are not live model predictions or calibrated confidence estimates.</Typography.Paragraph>
      </Card>

      <div className="strategy-content-grid">
        <Card title="Step-by-step action plan">
          <Steps orientation="vertical" current={-1} items={steps.map(({ event, checkpoint }) => ({
            key: event.id,
            title: <Typography.Text strong>{event.title}</Typography.Text>,
            content: <div className="strategy-step-content">
              <Typography.Text type="secondary">{formatPlanDate(event.date)} · {event.duration}</Typography.Text>
              <Typography.Paragraph>{event.description}</Typography.Paragraph>
              <Typography.Paragraph type="secondary"><strong>Before moving on:</strong> {checkpoint}</Typography.Paragraph>
              <Button type="link" size="small" href={`#${calendarEventPath(event)}`} icon={<CalendarDays size={14} />}>Review calendar event</Button>
            </div>,
          }))} />
        </Card>
        <div className="strategy-sidebar">
          <Card title="Why this sequence">
            {plan.reasons.slice(1).map(reason => <Typography.Paragraph key={reason}>{reason}</Typography.Paragraph>)}
            <Typography.Title level={5}>How the date was calculated</Typography.Title>
            <Typography.Paragraph type="secondary" className="no-margin">{plan.dateExplanation}</Typography.Paragraph>
          </Card>
          <Card title="If conditions change">
            {contingencies.map(item => <div key={item.condition} className="strategy-contingency">
              <Typography.Text strong>{item.condition}</Typography.Text>
              <Typography.Paragraph type="secondary">{item.action}</Typography.Paragraph>
            </div>)}
          </Card>
        </div>
      </div>

      <section aria-label="Illustrative strategy forecasts" className="strategy-forecast-grid">
        {forecastMetrics.map((metric, index) => {
          const values = comparison[index];
          const delta = values.projected - values.current;
          return <Card key={metric.projectedKey} title={metric.title} extra={<Tag>Sample prediction</Tag>}>
          <div className="strategy-forecast-summary">
            <div><Typography.Text type="secondary">Current</Typography.Text><Typography.Text strong>{values.current}{metric.unit}</Typography.Text></div>
            <ArrowUpRight size={18} aria-hidden="true" />
            <div><Typography.Text type="secondary">Projected</Typography.Text><Typography.Text strong>{values.projected}{metric.unit}</Typography.Text></div>
            <Tag color="success">{delta > 0 ? '+' : ''}{delta} {metric.deltaUnit}</Tag>
          </div>
          <div className="strategy-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecast} margin={{ top: 15, right: 16, left: 0, bottom: 6 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="#e5eadc" />
                <XAxis dataKey="date" tickFormatter={date => dayjs(date).format('MMM YY')} minTickGap={30} tick={axis} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={axis} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={date => formatPlanDate(String(date))} formatter={value => `${value}${metric.unit}`} />
                <Area type="monotone" dataKey={metric.gainKey} fill={metric.color} fillOpacity={.1} stroke="none" legendType="none" tooltipType="none" isAnimationActive={animate} animationDuration={650} />
                <Line type="linear" dataKey={metric.currentKey} name="Current baseline" stroke="#b8954d" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={animate} animationDuration={650} />
                <Line type="monotone" dataKey={metric.projectedKey} name="Projected with strategy" stroke={metric.color} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={animate} animationDuration={650} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Typography.Text type="secondary" className="strategy-chart-caption">{metric.description} Shading shows the difference from current conditions. Hover or use arrow keys to compare values.</Typography.Text>
        </Card>;
        })}
      </section>

      <Card title="Technical basis" className="strategy-table-card">
        <Table rowKey="key" dataSource={technicals} pagination={false} scroll={{ x: 760 }} columns={[
          { title: 'Parameter', dataIndex: 'parameter', width: 190 },
          { title: 'Current input', dataIndex: 'value', width: 260 },
          { title: 'How it affects this strategy', dataIndex: 'role' },
        ]} />
      </Card>

      <Card
        id="strategy-calendar-proposals"
        title="Events proposed to your calendar"
        className="strategy-proposals strategy-table-card"
        extra={<EventResponseControls fieldId={field.id} />}
      >
        <Typography.Paragraph type="secondary" className="strategy-proposal-intro">Review the {events.length} events below, then accept or reject the entire schedule. Accept all confirms them in your calendar; Reject all hides them. You can change your decision here or in the calendar. Responses are saved in this browser. {counts.accepted} accepted · {counts.declined} rejected · {counts.proposed} awaiting a decision.</Typography.Paragraph>
        <Table<PlannedEvent>
          rowKey="id"
          dataSource={events}
          pagination={false}
          scroll={{ x: 560 }}
          columns={[
            { title: 'Date', dataIndex: 'date', width: 145, render: date => formatPlanDate(date) },
            { title: 'Proposed event', dataIndex: 'title', render: (title, event) => <div><Typography.Text strong>{title}</Typography.Text><Typography.Paragraph type="secondary" className="strategy-event-rationale">{event.duration} · {event.rationale}</Typography.Paragraph></div> },
          ]}
        />
      </Card>
    </div>
  </div>;
}

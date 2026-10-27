import { Button } from 'antd';
import { CalendarDays, Plus } from 'lucide-react';
import { PageHeading } from '../components/common/PageHeading';
import { FieldsTable } from '../components/fields/FieldsTable';
import { FieldInsight } from '../components/fields/FieldInsight';
import { MapCard } from '../components/map/MapCard';
import { OverviewCharts } from '../components/overview/OverviewCharts';
import { WeatherCard } from '../components/weather/WeatherCard';
import { useFarm } from '../hooks/useFarm';
import type { Navigate } from '../types/navigation';

export function OverviewPage({ navigate }: { navigate: Navigate; }) {
  const { fields } = useFarm();
  const totalArea = fields.reduce((total, field) => total + field.area, 0);
  const attentionCount = fields.filter(field => field.status !== 'Healthy').length;
  const criticalCount = fields.filter(field => field.status === 'Critical').length;
  const summary = fields.length
    ? `${fields.length} ${fields.length === 1 ? 'field' : 'fields'} · ${totalArea.toLocaleString('en-US', { maximumFractionDigits: 1 })} ha total · ${attentionCount} ${attentionCount === 1 ? 'field needs' : 'fields need'} attention${criticalCount ? `, including ${criticalCount} critical` : ''}.`
    : 'No fields added yet. Add a field to view its location and monitor crop conditions.';

  return (
    <>
      <PageHeading
        eyebrow=""
        title="Overview"
        description={summary}
        actions={<><Button icon={<CalendarDays size={18} />} onClick={() => navigate('/history')}>Environment history</Button><Button
          type="primary"
          icon={<Plus size={19} />}
          onClick={() => navigate('/map/add')}
        >Add field</Button></>}
      />
      <section className="map-weather-grid">
        <MapCard navigate={navigate} />
        <aside className="right-column">
          <WeatherCard navigate={navigate} />
          <FieldInsight navigate={navigate} />
        </aside>
      </section>
      <OverviewCharts />
      <FieldsTable navigate={navigate} overview />
    </>
  );
}

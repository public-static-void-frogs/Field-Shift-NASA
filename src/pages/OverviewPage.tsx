import { Button } from 'antd';
import { CalendarDays, Plus } from 'lucide-react';
import { PageHeading } from '../components/common/PageHeading';
import { FarmStats } from '../components/common/FarmStats';
import { FieldsTable } from '../components/fields/FieldsTable';
import { FieldInsight } from '../components/fields/FieldInsight';
import { MapCard } from '../components/map/MapCard';
import { WeatherCard } from '../components/weather/WeatherCard';
import type { Navigate } from '../types/navigation';

export function OverviewPage({ navigate }: { navigate: Navigate; }) {
  return (
    <>
      <PageHeading
        title="A good day to grow."
        description="Keep an eye on your fields. We’ll help you see what needs a little care."
        actions={<><Button icon={<CalendarDays size={18} />} onClick={() => navigate('/history')}>May 24, 2026</Button><Button
          type="primary"
          icon={<Plus size={19} />}
          onClick={() => navigate('/map/add')}
        >Add field</Button></>}
      />
      <FarmStats />
      <section className="map-weather-grid">
        <MapCard navigate={navigate} />
        <aside className="right-column">
          <WeatherCard navigate={navigate} />
          <FieldInsight navigate={navigate} />
        </aside>
      </section>
      <FieldsTable navigate={navigate} overview />
    </>
  );
}

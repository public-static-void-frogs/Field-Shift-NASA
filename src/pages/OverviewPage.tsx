import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { CalendarDays, Plus } from 'lucide-react';
import { PageHeading } from '../components/common/PageHeading';
import { FieldsTable } from '../components/fields/FieldsTable';
import { MapCard } from '../components/map/MapCard';
import { OverviewCharts } from '../components/overview/OverviewCharts';
import { WeatherCard } from '../components/weather/WeatherCard';
import { useFarm } from '../hooks/useFarm';
import type { Navigate } from '../types/navigation';

export function OverviewPage({ navigate }: { navigate: Navigate; }) {
  const { t, i18n } = useTranslation();
  const { fields } = useFarm();
  const totalArea = fields.reduce((total, field) => total + field.area, 0);
  const attentionCount = fields.filter(field => field.status !== 'Healthy').length;
  const criticalCount = fields.filter(field => field.status === 'Critical').length;
  const summary = fields.length
    ? t('Farm summary', { count: fields.length, area: totalArea.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 }), attention: attentionCount, critical: criticalCount })
    : t('No fields added yet. Add a field to view its location and monitor crop conditions.');

  return (
    <>
      <PageHeading
        eyebrow=""
        title={t('Overview')}
        description={summary}
        actions={<><Button icon={<CalendarDays size={18} />} onClick={() => navigate('/history')}>{t('Environment history')}</Button><Button
          type="primary"
          icon={<Plus size={19} />}
          onClick={() => navigate('/map/add')}
        >{t('Add field')}</Button></>}
      />
      <section className="map-weather-grid">
        <MapCard navigate={navigate} />
        <WeatherCard navigate={navigate} />
      </section>
      <OverviewCharts />
      <FieldsTable navigate={navigate} overview />
    </>
  );
}

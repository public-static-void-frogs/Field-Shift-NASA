import { CalendarDays, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeading } from '../components/common/PageHeading';
import { RouterButton } from '../components/common/RouterButton';
import { FieldsTable } from '../components/fields/FieldsTable';
import { MapCard } from '../components/map/MapCard';
import { OverviewCharts } from '../components/overview/OverviewCharts';
import { WeatherCard } from '../components/weather/WeatherCard';
import { useFarm } from '../hooks/useFarm.ts';

export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const { fields } = useFarm();
  const totalArea = fields.reduce((total, field) => total + field.area, 0);
  const attentionCount = fields.filter((field) => field.status !== 'Healthy').length;
  const criticalCount = fields.filter((field) => field.status === 'Critical').length;
  const summary = fields.length
    ? t('Farm summary', {
        count: fields.length,
        area: totalArea.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 }),
        attention: attentionCount,
        critical: criticalCount,
      })
    : t('No fields added yet. Add a field to view its location and monitor crop conditions.');

  return (
    <>
      <PageHeading
        eyebrow=""
        title={t('Overview')}
        description={summary}
        actions={
          <>
            <RouterButton icon={<CalendarDays size={18} />} to="/history">
              {t('Environment history')}
            </RouterButton>
            <RouterButton type="primary" icon={<Plus size={19} />} to="/map/add">
              {t('Add field')}
            </RouterButton>
          </>
        }
      />
      <section className="map-weather-grid">
        <MapCard />
        <WeatherCard />
      </section>
      <OverviewCharts />
      <FieldsTable overview />
    </>
  );
}

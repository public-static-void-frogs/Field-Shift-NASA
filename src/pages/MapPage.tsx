import { useTranslation } from 'react-i18next';
import { fieldGeoJson } from '../data/fieldGeoJson';
import { Button } from 'antd';
import { useFarm } from '../hooks/useFarm';
import { FieldMap } from '../components/map/FieldMap';
import type { Navigate } from '../types/navigation';

export function MapPage({ navigate, adding = false }: { navigate: Navigate; adding?: boolean; }) {
  const { t } = useTranslation();
  const { fields } = useFarm();
  return (
    <div className="fullscreen-map">
      <FieldMap
        fields={fields}
        geojson={fieldGeoJson}
        onSelect={field => navigate(`/fields/${field.id}`)}
        adding={adding}
        onAdd={id => navigate(`/map/add/${id}`)}
        expanded
      />
      {adding && <Button className="map-cancel-adding" onClick={() => navigate('/map')}>
         {t('Cancel adding')} </Button>}
    </div>
  );
}

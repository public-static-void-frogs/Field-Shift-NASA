import { useSuspenseQuery } from '@tanstack/react-query';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { mapQueries } from '../api/maps/maps.queries.ts';
import { FieldMap } from '../components/map/FieldMap';
import { useFarm } from '../hooks/useFarm.ts';
import type { MapPageProps } from '../types/maps/MapPage.types.ts';

export function MapPage({ navigate, adding = false }: MapPageProps) {
  const { t } = useTranslation();
  const { fields } = useFarm();
  const { data: fieldGeoJson } = useSuspenseQuery(mapQueries.geojson());
  return (
    <div className="fullscreen-map">
      <FieldMap
        fields={fields}
        geojson={fieldGeoJson}
        onSelect={(field) => navigate(`/fields/${field.id}`)}
        adding={adding}
        onAdd={(id) => navigate(`/map/add/${id}`)}
        expanded
      />
      {adding && (
        <Button className="map-cancel-adding" onClick={() => navigate('/map')}>
          {t('Cancel adding')}{' '}
        </Button>
      )}
    </div>
  );
}

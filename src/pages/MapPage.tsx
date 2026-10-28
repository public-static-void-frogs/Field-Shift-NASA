import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMatch, useNavigate } from 'react-router-dom';
import { mapQueries } from '../api/maps/maps.queries.ts';
import { RouterButton } from '../components/common/RouterButton';
import { FieldMap } from '../features/maps/components/FieldMap';
import { useFarm } from '../hooks/useFarm.ts';

export function MapPage() {
  const adding = useMatch('/map/add') !== null;
  const navigate = useNavigate();
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
        <RouterButton className="map-cancel-adding" to="/map">
          {t('Cancel adding')}{' '}
        </RouterButton>
      )}
    </div>
  );
}

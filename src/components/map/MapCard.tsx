import { useSuspenseQuery } from '@tanstack/react-query';
import { Button, Card, Tooltip } from 'antd';
import { Expand } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { mapQueries } from '../../api/maps/maps.queries.ts';
import { useFarm } from '../../hooks/useFarm.ts';
import type { MapCardProps } from '../../types/maps/MapCard.types.ts';
import { FieldMap } from './FieldMap';

export function MapCard({ navigate, expanded = false, adding = false }: MapCardProps) {
  const { t } = useTranslation();
  const { fields } = useFarm();
  const { data: fieldGeoJson } = useSuspenseQuery(mapQueries.geojson());
  return (
    <Card className="map-card">
      <FieldMap
        fields={fields}
        geojson={fieldGeoJson}
        onSelect={(field) => navigate(`/fields/${field.id}`)}
        adding={adding}
        onAdd={(id) => navigate(`/map/add/${id}`)}
        expanded={expanded}
      />
      <Tooltip title={expanded ? t('Return to overview') : t('Expand map')}>
        <Button
          className="map-expand"
          aria-label={expanded ? t('Return to overview') : t('Expand map')}
          icon={<Expand size={18} />}
          onClick={() => navigate(expanded ? '/' : '/map')}
        />
      </Tooltip>
    </Card>
  );
}

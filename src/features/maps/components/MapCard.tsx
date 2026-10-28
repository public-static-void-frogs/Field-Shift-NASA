import { useSuspenseQuery } from '@tanstack/react-query';
import { Card, Tooltip } from 'antd';
import { Expand } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fieldQueries } from '../../../api/fields/fields.queries.ts';
import { mapQueries } from '../../../api/maps/maps.queries.ts';
import { RouterButton } from '../../../components/common/RouterButton';
import type { MapCardProps } from '../../../types/maps/MapCard.types.ts';
import { FieldMap } from './FieldMap';

export function MapCard({ expanded = false, adding = false }: MapCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: fields } = useSuspenseQuery(fieldQueries.list());
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
        <RouterButton
          className="map-expand"
          aria-label={expanded ? t('Return to overview') : t('Expand map')}
          icon={<Expand size={18} />}
          to={expanded ? '/' : '/map'}
        />
      </Tooltip>
    </Card>
  );
}

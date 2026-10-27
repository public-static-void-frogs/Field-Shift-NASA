import { Button, Card, Tooltip } from 'antd';
import { Expand } from 'lucide-react';
import { fieldGeoJson } from '../../data/fieldGeoJson';
import { useFarm } from '../../hooks/useFarm';
import type { Navigate } from '../../types/navigation';
import { FieldMap } from './FieldMap';

export function MapCard({ navigate, expanded = false, adding = false }: { navigate: Navigate; expanded?: boolean; adding?: boolean; }) {
  const { fields } = useFarm();
  return (
    <Card className="map-card">
      <FieldMap
        fields={fields}
        geojson={fieldGeoJson}
        onSelect={field => navigate(`/fields/${field.id}`)}
        adding={adding}
        onAdd={id => navigate(`/map/add/${id}`)}
        expanded={expanded}
      />
      <Tooltip title={expanded ? 'Return to overview' : 'Expand map'}>
        <Button
          className="map-expand"
          aria-label={expanded ? 'Return to overview' : 'Expand map'}
          icon={<Expand size={18} />}
          onClick={() => navigate(expanded ? '/' : '/map')}
        />
      </Tooltip>
    </Card>
  );
}

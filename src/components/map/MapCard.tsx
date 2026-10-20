import { Badge, Button, Card, Flex, Typography } from 'antd';
import { Expand } from 'lucide-react';
import { useFarm } from '../../hooks/useFarm';
import type { Navigate } from '../../types/navigation';
import { FieldMap } from './FieldMap';

export function MapCard({ navigate, expanded = false, adding = false }: { navigate: Navigate; expanded?: boolean; adding?: boolean; }) {
  const { fields } = useFarm();
  return (
    <Card
      className="map-card"
      title={<span>
        Your field map
        <Typography.Text type="secondary">
          {fields.length}
          fields
        </Typography.Text>
      </span>}
      extra={<Button
        type="text"
        aria-label={expanded ? 'Return to overview' : 'Expand map'}
        icon={<Expand size={20} />}
        onClick={() => navigate(expanded ? '/' : '/map')}
      />}
    >
      <FieldMap
        fields={fields}
        onSelect={field => navigate(`/fields/${field.id}`)}
        adding={adding}
        onAdd={id => navigate(`/map/add/${id}`)}
        expanded={expanded}
      />
      <Flex
        justify="space-between"
        gap={12}
        wrap
        className="map-footer"
      >
        <Badge status="success" text="Updated just now" />
        <Typography.Text type="secondary">Drag to explore · Click a field to see more</Typography.Text>
      </Flex>
    </Card>
  );
}

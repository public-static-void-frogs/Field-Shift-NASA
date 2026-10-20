import { Badge, Card, Statistic, Typography } from 'antd';
import { Droplets, Map, Sprout, TriangleAlert } from 'lucide-react';
import { useFarm } from '../../hooks/useFarm';

export function FarmStats() {
  const { fields } = useFarm();
  const healthy = fields.filter(field => field.status === 'Healthy').length;
  const critical = fields.filter(field => field.status === 'Critical').length;
  const stats = [
    {
      title: 'Total farm area',
      value: fields.reduce((total, field) => total + field.area, 0).toFixed(1),
      unit: 'ha',
      icon: Map,
      description: `${fields.length} fields across your farm`
    },
    {
      title: 'Healthy fields',
      value: healthy,
      unit: `/ ${fields.length} fields`,
      icon: Sprout,
      description: 'Looking good this season'
    },
    {
      title: 'Need your attention',
      value: fields.length - healthy,
      unit: 'fields',
      icon: TriangleAlert,
      description: `${critical} ${critical === 1 ? 'field needs' : 'fields need'} immediate care`
    },
    {
      title: 'Average soil moisture',
      value: Math.round(fields.reduce((total, field) => total + field.moisture, 0) / Math.max(fields.length, 1)),
      unit: '%',
      icon: Droplets,
      description: '+4% from last week'
    },
  ];
  return (
    <section className="stat-grid" aria-label="Farm metrics">
      {stats.map(({ title, value, unit, icon: Icon, description }) => (
        <Card key={title} className="stat-card">
          <Statistic
            title={<span className="stat-title">
              {title}
              <Icon size={20} />
            </span>}
            value={value}
            suffix={unit}
          />
          <Typography.Text type="secondary">
            <Badge status={title === 'Need your attention' ? 'warning' : 'success'} />
            {description}
          </Typography.Text>
        </Card>
      ))}
    </section>
  );
}

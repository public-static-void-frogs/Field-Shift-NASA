import { useTranslation } from 'react-i18next';
import { Badge, Card, Statistic, Typography } from 'antd';
import { Droplets, Map, Sprout, TriangleAlert } from 'lucide-react';
import { useFarm } from '../../hooks/useFarm';

export function FarmStats() {
  const { t } = useTranslation();
  const { fields } = useFarm();
  const healthy = fields.filter(field => field.status === 'Healthy').length;
  const critical = fields.filter(field => field.status === 'Critical').length;
  const stats = [
    {
      title: t('Total farm area'),
      value: fields.reduce((total, field) => total + field.area, 0).toFixed(1),
      unit: t('ha'),
      icon: Map,
      description: t('{{value0}} fields across your farm', { value0: fields.length })
    },
    {
      title: t('Healthy fields'),
      value: healthy,
      unit: t('/ {{value0}} fields', { value0: fields.length }),
      icon: Sprout,
      description: t('Looking good this season')
    },
    {
      title: t('Need your attention'),
      value: fields.length - healthy,
      unit: t('fields'),
      icon: TriangleAlert,
      description: t('Immediate care', { count: critical })
    },
    {
      title: t('Average soil moisture'),
      value: Math.round(fields.reduce((total, field) => total + field.moisture, 0) / Math.max(fields.length, 1)),
      unit: '%',
      icon: Droplets,
      description: t('+4% from last week')
    },
  ];
  return (
    <section className="stat-grid" aria-label={t('Farm metrics')}>
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
            <Badge status={title === t('Need your attention') ? 'warning' : 'success'} />
            {description}
          </Typography.Text>
        </Card>
      ))}
    </section>
  );
}

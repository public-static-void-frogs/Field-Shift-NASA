import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Empty, Space } from 'antd';
import { ArrowRight } from 'lucide-react';
import { useFarm } from '../hooks/useFarm';
import { PageHeading } from '../components/common/PageHeading';
import type { Navigate } from '../types/navigation';

export function NotificationsPage({ navigate }: { navigate: Navigate }) {
  const { t } = useTranslation();
  const { fields } = useFarm();
  const attention = fields.filter((field) => field.status !== 'Healthy');
  return (
    <>
      <PageHeading
        title={t('A heads-up from your farm.')}
        description={t('The field updates and weather changes worth keeping an eye on.')}
        eyebrow={t('NOTIFICATIONS')}
      />
      <Space orientation="vertical" size={20} className="full-width">
        {attention.map((field) => (
          <Card key={field.id}>
            <Alert
              type={field.status === 'Critical' ? 'error' : 'warning'}
              showIcon
              title={t('{{value0}} needs a little care', { value0: field.name })}
              description={
                field.nitrogen < 20
                  ? t('Nitrogen has dropped below the healthy range. Plan a nutrient top-up soon.')
                  : t('Soil moisture is low. Check your irrigation schedule.')
              }
            />
            <Button
              className="notification-link"
              type="link"
              onClick={() => navigate(`/fields/${field.id}`)}
            >
              {t('View field')} <ArrowRight size={18} />
            </Button>
          </Card>
        ))}
        {!attention.length && (
          <Card>
            <Empty description={t('Your fields are looking good. You’re all caught up.')} />
          </Card>
        )}
        <Card>
          <Alert
            type="info"
            showIcon
            title={t('Light rain expected Thursday')}
            description={t('A good window to plan nutrient applications.')}
          />
          <Button className="notification-link" type="link" onClick={() => navigate('/history')}>
            {t('View weather history')} <ArrowRight size={18} />
          </Button>
        </Card>
      </Space>
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { ArrowUpRight, CalendarDays, Sprout } from 'lucide-react';
import { getRotationPlan } from '../../data/planning';
import { formatPlanDate } from '../../utils/planningDates';
import type { Field } from '../../types/field';

export function CropRotationPlan({ field }: { field: Field }) {
  const { t } = useTranslation();
  const plan = getRotationPlan(field);
  return (
    <Card id="crop-rotation-plan" className="rotation-summary rotation-plan-anchor">
      <Flex justify="space-between" align="center" gap={20} wrap>
        <div className="rotation-summary-copy">
          <Space size={8}>
            <Sprout size={19} />
            <Typography.Text strong>{t('Rotation recommendation')}</Typography.Text>
            <Tag>{t('Model draft')}</Tag>
          </Space>
          <Typography.Title level={4}>{`${field.crop} → ${plan.nextCrop}`}</Typography.Title>
          <Typography.Paragraph type="secondary" className="no-margin">
            {t(
              'Review the field strategy, preparation steps, forecasts, and proposed calendar events.',
            )}
          </Typography.Paragraph>
        </div>
        <Flex gap={16} align="center" wrap className="rotation-summary-actions">
          <div className="rotation-summary-date">
            <Typography.Text type="secondary">{t('Planting window')}</Typography.Text>
            <Space size={6}>
              <CalendarDays size={16} />
              <Typography.Text strong>{formatPlanDate(plan.sowingDate)}</Typography.Text>
            </Space>
            <Typography.Text type="secondary">
              {t('through {{value0}}', { value0: formatPlanDate(plan.windowEnd) })}
            </Typography.Text>
          </div>
          <Button
            type="primary"
            href={`#/fields/${field.id}/strategy`}
            icon={<ArrowUpRight size={17} />}
          >
            {t('View strategy')}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

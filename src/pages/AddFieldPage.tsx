import type { UnavailableParcelProps } from '../types/fields/AddFieldPage.types.ts';
import { Button, Card, Descriptions, Form, Input, Result, Select, Space } from 'antd';
import { ArrowLeft, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeading } from '../components/common/PageHeading';
import { RouterButton } from '../components/common/RouterButton';
import { useAddField } from '../features/fields/hooks/useAddField.ts';

export function AddFieldPage() {
  const { t } = useTranslation();
  const { parcelId, parcel, cropOptions, isAddingField, preferences, exists, handleAdd } =
    useAddField();
  if (!parcel || exists) {
    return <UnavailableParcel exists={exists} />;
  }

  return (
    <>
      <RouterButton type="text" icon={<ArrowLeft size={19} />} to="/map/add">
        {t('Back to the map')}
      </RouterButton>
      <PageHeading
        title={t('Welcome a new field.')}
        description={t('Give this parcel a name and tell us what you’re growing.')}
        eyebrow={t('{{farmName}} · PARCEL {{parcelId}}', {
          farmName: preferences.farmName.toUpperCase(),
          parcelId: String(parcelId).padStart(2, '0'),
        })}
      />
      <Card className="form-card" title={t('Field information')}>
        <Descriptions
          className="section-gap"
          items={[
            {
              key: 'area',
              label: t('Area'),
              children: t('{{value0}} hectares', { value0: parcel.area }),
            },
            {
              key: 'soil',
              label: t('Soil type'),
              children: parcel.soilType,
            },
          ]}
        />
        <Form
          layout="vertical"
          initialValues={{
            name: parcel.name,
            crop: parcel.crop,
          }}
          onFinish={handleAdd}
          requiredMark={false}
        >
          <Form.Item
            label={t('Field name')}
            name="name"
            rules={[
              {
                required: true,
                whitespace: true,
                message: t('Enter a name for your field.'),
              },
              { max: 60, message: t('Use 60 characters or fewer.') },
            ]}
          >
            <Input placeholder={t('Give your field a name')} />
          </Form.Item>
          <Form.Item
            label={t('Crop type')}
            name="crop"
            rules={[{ required: true, message: t('Choose a crop.') }]}
          >
            <Select options={cropOptions} />
          </Form.Item>
          <Space>
            <Button
              type="primary"
              loading={isAddingField}
              htmlType="submit"
              icon={<Plus size={19} />}
            >
              {t('Add to my fields')}
            </Button>
            <RouterButton to="/map/add">{t('Cancel')}</RouterButton>
          </Space>
        </Form>
      </Card>
    </>
  );
}

function UnavailableParcel({ exists }: UnavailableParcelProps) {
  const { t } = useTranslation();

  return (
    <Result
      status="info"
      title={
        exists ? t('This field already belongs to your farm.') : t('This parcel isn’t available.')
      }
      extra={<RouterButton to="/map/add">{t('Back to the map')}</RouterButton>}
    />
  );
}

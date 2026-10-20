import { App, Button, Card, Descriptions, Form, Input, Result, Select, Space } from 'antd';
import { ArrowLeft, Plus } from 'lucide-react';
import { useFarm } from '../hooks/useFarm';
import { PageHeading } from '../components/common/PageHeading';
import { cropOptions, initialFields, parcels } from '../data/fields';
import type { Navigate } from '../types/navigation';

export function AddFieldPage({ parcelId, navigate }: { parcelId: number; navigate: Navigate; }) {
  const { fields, addField } = useFarm();
  const { message } = App.useApp();
  const exists = fields.some(field => field.id === parcelId);
  if (!parcels[parcelId - 1] || exists) {
    return (
      <Result
        status="info"
        title={exists ? 'This field already belongs to your farm.' : 'This parcel isn’t available.'}
        extra={<Button onClick={() => navigate('/map/add')}>Back to the map</Button>}
      />
    );
  }
  function handleAdd(values: { name: string; crop: string; }) {
    addField({
      id: parcelId,
      name: values.name.trim(),
      crop: values.crop,
      area: 12.6,
      health: 86,
      moisture: 59,
      nitrogen: 40,
      status: 'Healthy',
      planted: 'May 1, 2026'
    });
    message.success(`${values.name.trim()} added to your farm`);
    navigate(`/fields/${parcelId}`);
  }
  return (
    <>
      <Button
        type="text"
        icon={<ArrowLeft size={19} />}
        onClick={() => navigate('/map/add')}
      >Back to the map</Button>
      <PageHeading
        title="Welcome a new field."
        description="Give this parcel a name and tell us what you’re growing."
        eyebrow={`GREEN VALLEY FARM · PARCEL ${String(parcelId).padStart(2, '0')}`}
      />
      <Card className="form-card" title="Field information">
        <Descriptions
          className="section-gap"
          items={[
            {
              key: 'area',
              label: 'Area',
              children: '12.6 hectares'
            },
            {
              key: 'soil',
              label: 'Soil type',
              children: 'Loam'
            }
          ]}
        />
        <Form
          layout="vertical"
          initialValues={{
            name: initialFields.find(field => field.id === parcelId)?.name || 'West Orchard',
            crop: 'Soybeans'
          }}
          onFinish={handleAdd}
          requiredMark={false}
        >
          <Form.Item
            label="Field name"
            name="name"
            rules={[
              {
                required: true,
                whitespace: true,
                message: 'Enter a name for your field.'
              },
              { max: 60, message: 'Use 60 characters or fewer.' }
            ]}
          >
            <Input placeholder="Give your field a name" />
          </Form.Item>
          <Form.Item
            label="Crop type"
            name="crop"
            rules={[{ required: true, message: 'Choose a crop.' }]}
          >
            <Select options={cropOptions} />
          </Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<Plus size={19} />}
            >Add to my fields</Button>
            <Button onClick={() => navigate('/map/add')}>Cancel</Button>
          </Space>
        </Form>
      </Card>
    </>
  );
}

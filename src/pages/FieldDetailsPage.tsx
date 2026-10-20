import { useState } from 'react';
import { Alert, App, Badge, Button, Card, Flex, Form, Input, Result, Space, Statistic, Typography } from 'antd';
import { ArrowLeft, Check, CircleDollarSign, Droplets, FlaskConical, Sprout, Trash2 } from 'lucide-react';
import { useFarm } from '../hooks/useFarm';
import { PageHeading } from '../components/common/PageHeading';
import { FieldRecommendation } from '../components/fields/FieldRecommendation';
import { FieldStatus } from '../components/fields/FieldStatus';
import { FieldProperties } from '../components/fields/FieldProperties';
import { LandHistory } from '../components/fields/LandHistory';
import { CropRotationPlan } from '../components/fields/CropRotationPlan';
import { FieldHealthMap } from '../components/fields/FieldHealthMap';
import { getFieldProperties } from '../data/fieldProperties';
import type { Navigate } from '../types/navigation';

export function FieldDetailsPage({ fieldId, navigate }: { fieldId: number; navigate: Navigate; }) {
  const { fields, notes, saveNotes, removeField, preferences } = useFarm();
  const { message } = App.useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const field = fields.find(item => item.id === fieldId);
  if (!field) return (
    <Result
      status="404"
      title="Field not found"
      subTitle="This field may have been removed from your farm."
      extra={<Button type="primary" onClick={() => navigate('/fields')}>Back to my fields</Button>}
    />
  );
  const metrics = [
    {
      title: 'Crop health',
      value: field.health,
      unit: '/100',
      icon: Sprout,
      good: field.health > 75,
      critical: field.health < 50,
      description: field.health > 75 ? 'Growing well' : 'Growth needs support'
    },
    {
      title: 'Soil moisture',
      value: field.moisture,
      unit: '%',
      icon: Droplets,
      good: field.moisture > 45,
      critical: field.moisture < 35,
      description: field.moisture > 45 ? 'Well hydrated' : 'Your soil is getting dry'
    },
    {
      title: 'Nitrogen',
      value: field.nitrogen,
      unit: 'mg/kg',
      icon: FlaskConical,
      good: field.nitrogen > 30,
      critical: field.nitrogen < 20,
      description: field.nitrogen > 30 ? 'Enough for healthy growth' : field.nitrogen < 20 ? 'Very low · Add nutrients soon' : 'Low · Plan a nutrient top-up'
    },
  ];
  return (
    <>
      <Button
        type="text"
        icon={<ArrowLeft size={20} />}
        onClick={() => navigate('/fields')}
      >Back to my fields</Button>
      <PageHeading
        title={field.name}
        description={`${field.crop} · ${field.area} hectares · ${getFieldProperties(field.id).soilType}`}
        eyebrow={`${preferences.farmName.toUpperCase()} · FIELD ${String(field.id).padStart(2, '0')}`}
        actions={<Space wrap><FieldStatus status={field.status} /><Button type="primary" icon={<Sprout size={19} />} onClick={() => document.getElementById('crop-rotation-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Rotation plan</Button><Button icon={<CircleDollarSign size={19} />} onClick={() => navigate(`/finance/fields/${field.id}`)}>View finances</Button></Space>}
      />
      <FieldHealthMap key={field.id} field={field} />
      <Flex
        justify="space-between"
        align="center"
        gap={12}
        wrap
        className="section-gap"
      >
        <Typography.Title level={3} className="no-margin">How your field is doing</Typography.Title>
        <Badge status="success" text="Updated just now" />
      </Flex>
      <section className="detail-metrics">
        {metrics.map(({ title, value, unit, icon: Icon, good, critical, description }) => (
          <Card key={title} className={critical ? 'metric-danger' : good ? 'metric-good' : 'metric-warning'}>
            <Statistic
              title={<span className="stat-title">
                {title}
                <Icon size={22} />
              </span>}
              value={value}
              suffix={unit}
            />
            <Alert
              type={good ? 'success' : critical ? 'error' : 'warning'}
              showIcon
              title={description}
            />
          </Card>
        ))}
      </section>
      <div className="field-detail-stack">
        <CropRotationPlan field={field} />
        <FieldRecommendation key={field.id} field={field} />
        <FieldProperties field={field} />
        <Card title="Field notes">
          <Form
            layout="vertical"
            initialValues={{ note: notes[field.id] || '' }}
            onFinish={({ note }: { note: string }) => {
              saveNotes(field.id, note);
              message.success('Field notes saved');
            }}
          >
            <Form.Item name="note" label="Keep a note for your next visit">
              <Input.TextArea rows={4} placeholder="Add observations, planned work, or a reminder…" />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<Check size={19} />}>
              Save notes
            </Button>
          </Form>
        </Card>
        <Card title="Manage this field">
          <Flex justify="space-between" align="center" gap={20} wrap>
            <Typography.Paragraph type="secondary" className="no-margin">
              Remove this field from your farm list. You can add the parcel again from the map.
            </Typography.Paragraph>
            <Space wrap>
              <Button onClick={() => navigate('/map')}>Explore farm map</Button>
              {!confirmRemove && (
                <Button danger icon={<Trash2 size={18} />} onClick={() => setConfirmRemove(true)}>
                  Remove field
                </Button>
              )}
            </Space>
          </Flex>
          {confirmRemove && (
            <Alert
              className="field-remove-confirmation"
              type="warning"
              showIcon
              title={`Remove ${field.name}?`}
              description={
                <>
                  <Typography.Paragraph>Your field will leave the farm list.</Typography.Paragraph>
                  <Space wrap>
                    <Button danger onClick={() => {
                      removeField(field.id);
                      message.success('Field removed');
                      navigate('/map');
                    }}>
                      Confirm removal
                    </Button>
                    <Button onClick={() => setConfirmRemove(false)}>Keep field</Button>
                  </Space>
                </>
              }
            />
          )}
        </Card>
        <LandHistory key={field.id} field={field} />
      </div>
    </>
  );
}

import { App, Button, Card, Form, Input, Select } from 'antd';
import { Check } from 'lucide-react';
import { useFarm } from '../hooks/useFarm';
import { PageHeading } from '../components/common/PageHeading';

export function SettingsPage() {
  const { preferences, savePreferences } = useFarm();
  const { message } = App.useApp();
  return (
    <><PageHeading
      title="Make yourself at home."
      description="Manage your farm workspace and growing season."
      eyebrow="YOUR WORKSPACE"
    /><Card className="form-card" title="Farm settings">
        <Form
          layout="vertical"
          initialValues={preferences}
          requiredMark={false}
          onFinish={(values: typeof preferences) => {
            savePreferences({ ...values, farmName: values.farmName.trim() });
            message.success('Preferences saved');
          }}
        >
          <Form.Item
            label="Farm name"
            name="farmName"
            rules={[{
              required: true,
              whitespace: true,
              message: 'Enter a farm name.'
            }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Measurement units">
            <Select value="Metric (hectares, °C)" options={[{ value: 'Metric (hectares, °C)' }]} />
          </Form.Item>
          <Form.Item label="Growing season" name="season">
            <Select options={[{ value: '2026' }, { value: '2025' }]} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<Check size={19} />}
          >Save preferences</Button>
        </Form>
      </Card></>
  );
}

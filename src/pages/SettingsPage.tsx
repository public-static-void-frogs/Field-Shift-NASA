import { Avatar, Button, Card, Form, Input, Select, Space, Typography } from 'antd';
import { Camera, MapPin } from 'lucide-react';
import { useFarm } from '../hooks/useFarm';
import '../styles/settings.css';

function SectionActions({ section }: { section: string }) {
  return <Space size={8}>
    <Button disabled aria-label={`Clear ${section}`}>Clear</Button>
    <Button type="primary" disabled aria-label={`Save ${section}`}>Save</Button>
  </Space>;
}

export function SettingsPage() {
  const { preferences } = useFarm();
  return <div className="settings-page">
    <div className="page-heading"><Typography.Title level={1}>Settings</Typography.Title></div>
    <Form layout="vertical" requiredMark={false} initialValues={{
      fullName: 'James Wilson',
      email: 'james.wilson@example.com',
      farmName: preferences.farmName,
      season: preferences.season,
      location: 'Ames, Iowa, United States',
      timeZone: 'America/Chicago',
      units: 'metric',
      language: 'en',
      theme: 'light',
    }}>
      <div className="settings-grid">
        <Card title="Account information" extra={<SectionActions section="account information" />}>
          <div className="settings-profile-photo">
            <Avatar size={72}>JW</Avatar>
            <div>
              <Typography.Text strong>Profile photo</Typography.Text>
              <Button icon={<Camera size={17} />} disabled>Change photo</Button>
            </div>
          </div>
          <Form.Item label="Full name" name="fullName"><Input autoComplete="name" /></Form.Item>
          <Form.Item label="Email address" name="email"><Input type="email" autoComplete="email" /></Form.Item>
          <div className="settings-account-role"><Typography.Text type="secondary">Account role</Typography.Text><Typography.Text>Farm owner</Typography.Text></div>
        </Card>
        <Card title="Application preferences" extra={<SectionActions section="application preferences" />}>
          <Form.Item label="Measurement units" name="units">
            <Select options={[
              { value: 'metric', label: 'Metric (ha, °C, mm)' },
              { value: 'imperial', label: 'Imperial (ac, °F, in)' },
            ]} />
          </Form.Item>
          <Form.Item label="Application language" name="language">
            <Select options={[
              { value: 'en', label: 'English' },
              { value: 'uk', label: 'Українська' },
            ]} />
          </Form.Item>
          <Form.Item label="Color theme" name="theme">
            <Select options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System default' },
            ]} />
          </Form.Item>
        </Card>
        <Card title="Farm and location" className="settings-location-card" extra={<SectionActions section="farm and location" />}>
          <div className="settings-location-grid">
            <Form.Item label="Farm name" name="farmName"><Input /></Form.Item>
            <Form.Item label="Current location" name="location"><Input prefix={<MapPin size={17} />} /></Form.Item>
            <Form.Item label="Growing season" name="season"><Select options={[{ value: '2026', label: '2026' }, { value: '2025', label: '2025' }]} /></Form.Item>
            <Form.Item label="Time zone" name="timeZone"><Input readOnly /></Form.Item>
          </div>
        </Card>
      </div>
    </Form>
  </div>;
}

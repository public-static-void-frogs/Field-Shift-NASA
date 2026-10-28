import { Avatar, Button, Card, Form, Input, Select, Space, Typography } from 'antd';
import { Camera, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFarm } from '../hooks/useFarm.ts';
import '../styles/settings.css';
import type { SectionActionsProps } from '../types/farm/SettingsPage.types.ts';

function SectionActions({ section }: SectionActionsProps) {
  const { t } = useTranslation();
  return (
    <Space size={8}>
      <Button disabled aria-label={t('Clear {{value0}}', { value0: section })}>
        {t('Clear')}
      </Button>
      <Button type="primary" disabled aria-label={t('Save {{value0}}', { value0: section })}>
        {t('Save')}
      </Button>
    </Space>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { preferences } = useFarm();
  return (
    <div className="settings-page">
      <div className="page-heading">
        <Typography.Title level={1}>{t('Settings')}</Typography.Title>
      </div>
      <Form
        layout="vertical"
        requiredMark={false}
        onValuesChange={(changed) => {
          if (changed.language) void i18n.changeLanguage(changed.language);
        }}
        initialValues={{
          fullName: preferences.fullName,
          email: preferences.email,
          farmName: preferences.farmName,
          season: preferences.season,
          location: preferences.location,
          timeZone: preferences.timeZone,
          units: preferences.units,
          language: i18n.resolvedLanguage,
          theme: preferences.theme,
        }}
      >
        <div className="settings-grid">
          <Card
            title={t('Account information')}
            extra={<SectionActions section={t('Account information')} />}
          >
            <div className="settings-profile-photo">
              <Avatar size={72}>{preferences.initials}</Avatar>
              <div>
                <Typography.Text strong>{t('Profile photo')}</Typography.Text>
                <Button icon={<Camera size={17} />} disabled>
                  {t('Change photo')}
                </Button>
              </div>
            </div>
            <Form.Item label={t('Full name')} name="fullName">
              <Input autoComplete="name" />
            </Form.Item>
            <Form.Item label={t('Email address')} name="email">
              <Input type="email" autoComplete="email" />
            </Form.Item>
            <div className="settings-account-role">
              <Typography.Text type="secondary">{t('Account role')}</Typography.Text>
              <Typography.Text>{t(preferences.role)}</Typography.Text>
            </div>
          </Card>
          <Card
            title={t('Application preferences')}
            extra={<SectionActions section={t('Application preferences')} />}
          >
            <Form.Item label={t('Measurement units')} name="units">
              <Select
                options={[
                  { value: 'metric', label: t('Metric (ha, °C, mm)') },
                  { value: 'imperial', label: t('Imperial (ac, °F, in)') },
                ]}
              />
            </Form.Item>
            <Form.Item label={t('Application language')} name="language">
              <Select
                options={[
                  { value: 'en', label: t('English') },
                  { value: 'uk', label: t('Українська') },
                ]}
              />
            </Form.Item>
            <Form.Item label={t('Color theme')} name="theme">
              <Select
                options={[
                  { value: 'light', label: t('Light') },
                  { value: 'dark', label: t('Dark') },
                  { value: 'system', label: t('System default') },
                ]}
              />
            </Form.Item>
          </Card>
          <Card
            title={t('Farm and location')}
            className="settings-location-card"
            extra={<SectionActions section={t('Farm and location')} />}
          >
            <div className="settings-location-grid">
              <Form.Item label={t('Farm name')} name="farmName">
                <Input />
              </Form.Item>
              <Form.Item label={t('Current location')} name="location">
                <Input prefix={<MapPin size={17} />} />
              </Form.Item>
              <Form.Item label={t('Growing season')} name="season">
                <Select
                  options={preferences.availableSeasons.map((value) => ({ value, label: value }))}
                />
              </Form.Item>
              <Form.Item label={t('Time zone')} name="timeZone">
                <Input readOnly />
              </Form.Item>
            </div>
          </Card>
        </div>
      </Form>
    </div>
  );
}

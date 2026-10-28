import { Avatar, Badge, Button, Layout, Menu, Tooltip } from 'antd';
import {
  Bell,
  CalendarDays,
  CircleHelp,
  History,
  LayoutDashboard,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Sprout,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useMatches } from 'react-router-dom';
import { useFarm } from '../../hooks/useFarm.ts';
import type { AppRouteHandle } from '../../types/shared/router.types.ts';
import { RouterButton } from '../common/RouterButton';

const { Sider, Content } = Layout;

export function AppLayout() {
  const matches = useMatches();
  const handle = matches.reduce<AppRouteHandle>(
    (value, match) => ({ ...value, ...(match.handle as AppRouteHandle | undefined) }),
    {},
  );
  const active = handle.navigationKey ?? '';
  const fullscreenCalendar = handle.workspace === 'calendar';
  const fullscreenMap = handle.workspace === 'map';
  const { t } = useTranslation();
  const { preferences } = useFarm();
  const mainItems = [
    {
      key: '/',
      label: (
        <NavLink to="/" end>
          {t('Overview')}
        </NavLink>
      ),
      icon: <LayoutDashboard size={21} />,
    },
    {
      key: '/map',
      label: <NavLink to="/map">{t('Field map')}</NavLink>,
      icon: <Map size={21} />,
    },
    {
      key: '/fields',
      label: <NavLink to="/fields">{t('My fields')}</NavLink>,
      icon: <Sprout size={21} />,
    },
    {
      key: '/calendar',
      label: <NavLink to="/calendar">{t('Calendar')}</NavLink>,
      icon: <CalendarDays size={21} />,
    },
    {
      key: '/history',
      label: <NavLink to="/history">{t('Environment history')}</NavLink>,
      icon: <History size={21} />,
    },
  ];

  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 991px)').matches);
  return (
    <Layout className="app-shell">
      <Sider
        id="farm-sidebar"
        className="sidebar"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={260}
        breakpoint="lg"
        collapsedWidth={76}
      >
        <div className="sidebar-brand-row">
          <Link to="/" className="brand" aria-label={t('FrogFarmers overview')}>
            <span className="brand-symbol">
              <img src="/frog-farmer.png" width={40} height={40} alt="" />
            </span>
            <span className="brand-word">FrogFarmers</span>
          </Link>
          <Tooltip title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}>
            <Button
              type="text"
              size="small"
              className="sidebar-collapse"
              aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
              aria-expanded={!collapsed}
              aria-controls="farm-sidebar"
              icon={collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              onClick={() => setCollapsed((current) => !current)}
            />
          </Tooltip>
        </div>
        <Menu mode="inline" selectedKeys={[active]} items={mainItems} />
        <div className="sidebar-bottom">
          <Menu
            mode="inline"
            selectedKeys={[active]}
            items={[
              {
                key: '/notifications',
                label: <NavLink to="/notifications">{t('Notifications')}</NavLink>,
                icon: (
                  <Badge dot color="#b8954d">
                    <Bell size={21} />
                  </Badge>
                ),
              },
              {
                key: '/settings',
                label: <NavLink to="/settings">{t('Settings')}</NavLink>,
                icon: <Settings2 size={21} />,
              },
              {
                key: '/help',
                label: <NavLink to="/help">{t('Help & resources')}</NavLink>,
                icon: <CircleHelp size={21} />,
              },
            ]}
          />
          <RouterButton type="text" className="profile" to="/settings">
            <Avatar size={40}>{preferences.initials}</Avatar>
            <span className="sidebar-label">
              <strong>{preferences.fullName}</strong>
              <span>{t(preferences.role)}</span>
            </span>
          </RouterButton>
        </div>
      </Sider>
      <Layout className="workspace">
        <Content
          className={`main-content${fullscreenMap || fullscreenCalendar ? ' main-content-map' : handle.workspace === 'fields' ? ' main-content-fields' : ''}`}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

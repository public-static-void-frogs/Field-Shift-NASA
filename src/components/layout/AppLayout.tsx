import { useState, type ReactNode } from 'react';
import { Avatar, Badge, Button, Layout, Menu, Tooltip } from 'antd';
import { Bell, CircleHelp, CalendarDays, History, LayoutDashboard, Map, PanelLeftClose, PanelLeftOpen, Settings2, Sprout } from 'lucide-react';
import type { Navigate } from '../../types/navigation';

const { Sider, Content } = Layout;

const mainItems = [
  {
    key: '/',
    label: 'Overview',
    icon: <LayoutDashboard size={21} />
  },
  {
    key: '/map',
    label: 'Field map',
    icon: <Map size={21} />
  },
  {
    key: '/fields',
    label: 'My fields',
    icon: <Sprout size={21} />
  },
  {
    key: '/calendar',
    label: 'Calendar',
    icon: <CalendarDays size={21} />
  },
  {
    key: '/history',
    label: 'Environment history',
    icon: <History size={21} />
  },
];

export function AppLayout({ path, navigate, children }: { path: string; navigate: Navigate; children: ReactNode; }) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 991px)').matches);
  const fullscreenCalendar = /^\/calendar(?:\/\d{4}-\d{2}-\d{2})?$/.test(path);
  const fullscreenMap = path === '/map' || path === '/map/add';
  const active = path.startsWith('/calendar') ? '/calendar' : path.startsWith('/fields') ? '/fields' : path.startsWith('/map') ? '/map' : path;
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
        <a href="#/" className="brand" aria-label="FrogFarmers overview">
          <span className="brand-symbol">
            <img src="/frog-farmer.png" width={40} height={40} alt="" />
          </span>
          <span className="brand-word">FrogFarmers</span>
        </a>
        <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Button
            type="text"
            size="small"
            className="sidebar-collapse"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="farm-sidebar"
            icon={collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            onClick={() => setCollapsed(current => !current)}
          />
        </Tooltip>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[active]}
          onClick={({ key }) => navigate(key)}
          items={mainItems}
        />
        <div className="sidebar-bottom">
          <Menu
            mode="inline"
            selectedKeys={[path]}
            onClick={({ key }) => navigate(key)}
            items={[
              {
                key: '/notifications',
                label: 'Notifications',
                icon: <Badge dot color="#b8954d"><Bell size={21} /></Badge>
              },
              {
                key: '/settings',
                label: 'Settings',
                icon: <Settings2 size={21} />
              },
              {
                key: '/help',
                label: 'Help & resources',
                icon: <CircleHelp size={21} />
              }
            ]}
          />
          <Button
            type="text"
            className="profile"
            onClick={() => navigate('/settings')}
          >
            <Avatar size={40}>JW</Avatar>
            <span className="sidebar-label">
              <strong>James Wilson</strong>
              <span>Farm owner</span>
            </span>
          </Button>
        </div>
      </Sider>
      <Layout className="workspace">
        <Content className={`main-content${fullscreenMap || fullscreenCalendar ? ' main-content-map' : path === '/fields' ? ' main-content-fields' : ''}`}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

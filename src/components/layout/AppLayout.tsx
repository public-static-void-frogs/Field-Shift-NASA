import type { ReactNode } from 'react';
import { Avatar, Badge, Breadcrumb, Button, Card, Flex, Layout, Menu, Space, Tooltip, Typography } from 'antd';
import { Bell, CircleHelp, CircleDollarSign, CalendarDays, History, LayoutDashboard, Map, Settings2, Sprout, Wheat } from 'lucide-react';
import { useFarm } from '../../hooks/useFarm';
import type { Navigate } from '../../types/navigation';

const { Header, Sider, Content, Footer } = Layout;

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
    key: '/finance',
    label: 'Finance [Beta]',
    icon: <CircleDollarSign size={21} />
  },
  {
    key: '/history',
    label: 'Environment history',
    icon: <History size={21} />
  },
];

const labels: Record<string, string> = {
  '/': 'Overview',
  '/map': 'Field map',
  '/fields': 'My fields',
  '/history': 'Environment history',
  '/finance': 'Finance [Beta]',
  '/calendar': 'Calendar',
  '/settings': 'Settings',
  '/help': 'Help & resources',
  '/notifications': 'Notifications',
};

export function AppLayout({ path, navigate, children }: { path: string; navigate: Navigate; children: ReactNode; }) {
  const { fields, preferences } = useFarm();
  const active = path.startsWith('/calendar') ? '/calendar' : path.startsWith('/finance') ? '/finance' : path.startsWith('/fields') ? '/fields' : path.startsWith('/map') ? '/map' : path;
  const breadcrumbItems = [{ title: 'Workspace' }, {
    title: <a href={`#${active}`}>
      {labels[active] || 'My fields'}
    </a>
  }];
  if (/^\/fields\/\d+$/.test(path) || /^\/finance\/fields\/\d+$/.test(path)) {
    breadcrumbItems.push({
      title: <span>
        {fields.find(field => field.id === Number(path.split('/').at(-1)))?.name || 'Field details'}
      </span>
    });
  }
  return (
    <Layout className="app-shell">
      <Sider
        className="sidebar"
        width={260}
        breakpoint="lg"
        collapsedWidth={76}
      >
        <a href="#/" className="brand">
          <span className="brand-symbol">
            <Sprout size={29} />
          </span>
          <span className="brand-word">
            terra
            <span>field</span>
          </span>
        </a>
        <div className="farm-selector">
          <Avatar
            shape="square"
            size={40}
            icon={<Wheat size={23} />}
          />
          <div className="sidebar-label">
            <Typography.Text strong>
              {preferences.farmName}
            </Typography.Text>
            <Typography.Text type="secondary">Personal workspace</Typography.Text>
          </div>
        </div>
        <Typography.Text className="nav-caption">WORKSPACE</Typography.Text>
        <Menu
          mode="inline"
          selectedKeys={[active]}
          onClick={({ key }) => navigate(key)}
          items={mainItems}
        />
        <div className="sidebar-bottom">
          <Card className="season-card" size="small">
            <Sprout size={24} />
            <Typography.Title level={5}>
              A little care.
              <br />
              A better harvest.
            </Typography.Title>
            <Typography.Paragraph type="secondary">Your next great season starts with a healthy field.</Typography.Paragraph>
            <Typography.Text type="secondary">
              Growing season
              {preferences.season}
            </Typography.Text>
          </Card>
          <Menu
            mode="inline"
            selectedKeys={[path]}
            onClick={({ key }) => navigate(key)}
            items={[
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
        <Header className="topbar">
          <Breadcrumb items={breadcrumbItems} />
          <Space size={20}>
            <span className="sync-status">
              <Badge status="success" text="All systems up to date" />
            </span>
            <Tooltip title="Notifications">
              <Button
                type="text"
                aria-label="Notifications"
                icon={<Badge dot color="#b8954d">
                  <Bell size={22} />
                </Badge>}
                onClick={() => navigate('/notifications')}
              />
            </Tooltip>
            <Avatar>JW</Avatar>
          </Space>
        </Header>
        <Content className="main-content">
          {children}
          <Footer className="page-footer">
            <Flex gap={10} align="center">
              <Sprout size={18} />
              <span>Good for your fields. Better for your future.</span>
            </Flex>
            <span>
              {preferences.farmName}
              · Growing together since 2024
            </span>
          </Footer>
        </Content>
      </Layout>
    </Layout>
  );
}

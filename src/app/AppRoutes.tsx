import { Button, Result } from 'antd';
import { AppLayout } from '../components/layout/AppLayout';
import { useRoute } from '../hooks/useRoute';
import { AddFieldPage } from '../pages/AddFieldPage';
import { FieldDetailsPage } from '../pages/FieldDetailsPage';
import { FinancePage } from '../pages/FinancePage';
import { FieldFinancePage } from '../pages/FieldFinancePage';
import { FieldsPage } from '../pages/FieldsPage';
import { HelpPage } from '../pages/HelpPage';
import { HistoryPage } from '../pages/HistoryPage';
import { MapPage } from '../pages/MapPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { OverviewPage } from '../pages/OverviewPage';
import { SettingsPage } from '../pages/SettingsPage';

export function AppRoutes() {
  const { path, navigate } = useRoute();
  const fieldRoute = path.match(/^\/fields\/(\d+)$/);
  const financeRoute = path.match(/^\/finance\/fields\/(\d+)$/);
  const addRoute = path.match(/^\/map\/add\/(\d+)$/);
  const pages = {
    '/': <OverviewPage navigate={navigate} />,
    '/fields': <FieldsPage navigate={navigate} />,
    '/map': <MapPage navigate={navigate} />,
    '/map/add': <MapPage navigate={navigate} adding />,
    '/finance': <FinancePage navigate={navigate} />,
    '/history': <HistoryPage navigate={navigate} />,
    '/settings': <SettingsPage />,
    '/help': <HelpPage />,
    '/notifications': <NotificationsPage navigate={navigate} />,
  };

  let page;

  if (financeRoute) {
    page = <FieldFinancePage key={path} fieldId={Number(financeRoute[1])} navigate={navigate} />;
  } else if (fieldRoute) {
    page = (
      <FieldDetailsPage
        key={path}
        fieldId={Number(fieldRoute[1])}
        navigate={navigate}
      />
    );
  } else if (addRoute) {
    page = (
      <AddFieldPage
        key={path}
        parcelId={Number(addRoute[1])}
        navigate={navigate}
      />
    );
  } else {
    page = pages[path as keyof typeof pages] ?? (
      <Result
        status="404"
        title="Page not found"
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            Back to overview
          </Button>
        }
      />
    );
  }

  return (
    <AppLayout path={path} navigate={navigate}>
      {page}
    </AppLayout>
  );
}

import { useTranslation } from 'react-i18next';
import { Button, Result } from 'antd';
import { AppLayout } from '../components/layout/AppLayout';
import type { Navigate } from '../types/navigation';
import { ActionDetailsPage } from '../pages/ActionDetailsPage';
import { CalendarPage } from '../pages/CalendarPage';
import { AddFieldPage } from '../pages/AddFieldPage';
import { FieldDetailsPage } from '../pages/FieldDetailsPage';
import { FieldStrategyPage } from '../pages/FieldStrategyPage';
import { FieldsPage } from '../pages/FieldsPage';
import { HelpPage } from '../pages/HelpPage';
import { HistoryPage } from '../pages/HistoryPage';
import { MapPage } from '../pages/MapPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { OverviewPage } from '../pages/OverviewPage';
import { SettingsPage } from '../pages/SettingsPage';

export function AppRoutes({ route, navigate }: { route: string; navigate: Navigate }) {
  const { t } = useTranslation();
  const [path, search = ''] = route.split('?');
  const params = new URLSearchParams(search);
  const actionRoute = path.match(/^\/calendar\/actions\/([^/]+)$/);
  const calendarRoute = path.match(/^\/calendar(?:\/(\d{4}-\d{2}-\d{2}))?$/);
  const strategyRoute = path.match(/^\/fields\/(\d+)\/strategy$/);
  const fieldRoute = path.match(/^\/fields\/(\d+)$/);
  const addRoute = path.match(/^\/map\/add\/(\d+)$/);
  const pages = {
    '/': <OverviewPage navigate={navigate} />,
    '/fields': <FieldsPage navigate={navigate} />,
    '/map': <MapPage navigate={navigate} />,
    '/map/add': <MapPage navigate={navigate} adding />,
    '/history': <HistoryPage />,
    '/settings': <SettingsPage />,
    '/help': <HelpPage />,
    '/notifications': <NotificationsPage navigate={navigate} />,
  };

  let page;

  if (actionRoute) {
    page = <ActionDetailsPage eventId={actionRoute[1]} />;
  } else if (calendarRoute) {
    const fieldFilter = Number(params.get('field'));
    page = (
      <CalendarPage
        navigate={navigate}
        date={calendarRoute[1]}
        fieldId={fieldFilter > 0 ? fieldFilter : undefined}
        eventId={params.get('event') ?? undefined}
      />
    );

  } else if (strategyRoute) {
    page = <FieldStrategyPage key={path} fieldId={Number(strategyRoute[1])} navigate={navigate} />;
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
        title={t('Page not found')}
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
             {t('Back to overview')} </Button>
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

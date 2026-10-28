import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, Spin } from 'antd';
import enUS from 'antd/locale/en_US';
import ukUA from 'antd/locale/uk_UA';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createQueryClient } from '../api/core/query-client.ts';
import { QueryBoundary } from '../components/common/QueryBoundary';
import { useRoute } from '../hooks/useRoute.ts';
import { LoginPage } from '../pages/LoginPage';
import { theme } from './theme.ts';

const AppRoutes = lazy(() =>
  import('./AppRoutes').then((module) => ({ default: module.AppRoutes })),
);

export default function App() {
  const [queryClient] = useState(createQueryClient);
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'uk' ? ukUA : enUS;
  const componentLocale = {
    ...locale,
    Pagination: { ...locale.Pagination, page_size: t('Page size') },
  };
  const { path, navigate } = useRoute();
  return (
    <ConfigProvider theme={theme} locale={componentLocale}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <QueryErrorResetBoundary>
            {({ reset }) => (
              <QueryBoundary key={path.split('?')[0]} onReset={reset}>
                {path.split('?')[0] === '/login' ? (
                  <LoginPage navigate={navigate} />
                ) : (
                  <Suspense
                    fallback={
                      <div className="app-loading">
                        <Spin size="large" />
                      </div>
                    }
                  >
                    <AppRoutes route={path} navigate={navigate} />
                  </Suspense>
                )}
              </QueryBoundary>
            )}
          </QueryErrorResetBoundary>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}

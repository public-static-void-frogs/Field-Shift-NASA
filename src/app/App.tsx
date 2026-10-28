import { useTranslation } from 'react-i18next';
import enUS from 'antd/locale/en_US';
import ukUA from 'antd/locale/uk_UA';
import { lazy, Suspense } from 'react';
import { App as AntApp, ConfigProvider, Spin } from 'antd';
import { LoginPage } from '../pages/LoginPage';
import { useRoute } from '../hooks/useRoute';

const AppRoutes = lazy(() =>
  import('./AppRoutes').then((module) => ({ default: module.AppRoutes })),
);
import { FarmProvider } from './FarmProvider';
import { theme } from './theme';

export default function App() {
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
        <FarmProvider>
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
        </FarmProvider>
      </AntApp>
    </ConfigProvider>
  );
}

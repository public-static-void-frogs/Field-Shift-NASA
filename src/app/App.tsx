import { App as AntApp, ConfigProvider } from 'antd';
import { AppRoutes } from './AppRoutes';
import { FarmProvider } from './FarmProvider';
import { theme } from './theme';

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <FarmProvider>
          <AppRoutes />
        </FarmProvider>
      </AntApp>
    </ConfigProvider>
  );
}

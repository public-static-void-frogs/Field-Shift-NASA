import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import App from './app/App';
import './styles/global.css';
import './styles/layout.css';
import './styles/dashboard.css';
import './styles/field-details.css';
import './styles/finance.css';
import './styles/planning.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

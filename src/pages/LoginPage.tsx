import { Button, Form, Input } from 'antd';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FarmlandBackdrop } from '../components/common/FarmlandBackdrop';
import '../styles/login.css';

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <main className="login-page">
      <FarmlandBackdrop />
      <div className="login-corner-brand" aria-hidden="true">
        <img src="/frog-farmer.png" width={32} height={32} alt="" />
        <span>FrogFarmers</span>
      </div>
      <section className="login-clearing" aria-labelledby="login-heading">
        <div className="login-brand">
          <img src="/frog-farmer.png" width={64} height={64} alt="" />
          <span>FrogFarmers</span>
        </div>
        <h1 id="login-heading">{t('Log in')}</h1>
        <Form
          name="login"
          layout="vertical"
          requiredMark={false}
          // Frontend demo only: connect authentication here when a service is available.
          onFinish={() => navigate('/')}
        >
          <Form.Item
            label={t('Login')}
            name="login"
            rules={[{ required: true, whitespace: true, message: t('Enter your login.') }]}
          >
            <Input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('Your login')}
            />
          </Form.Item>
          <Form.Item
            label={t('Password')}
            name="password"
            rules={[{ required: true, message: t('Enter your password.') }]}
          >
            <Input.Password autoComplete="current-password" placeholder={t('Your password')} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            icon={<ArrowRight size={18} />}
            iconPlacement="end"
          >
            {t('Log in')}
          </Button>
        </Form>
      </section>
    </main>
  );
}

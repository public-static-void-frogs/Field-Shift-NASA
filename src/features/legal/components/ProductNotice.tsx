import { useTranslation } from 'react-i18next';
import { LegalLinks } from './LegalLinks.tsx';
import './legal.css';

export function ProductNotice() {
  const { t } = useTranslation();

  return (
    <section className="product-notice" aria-label={t('About FrogFarmers')}>
      <p>
        {t(
          'FrogFarmers helps farmers explore field conditions, compare crop rotations, and review a schedule of field work. This public prototype uses sample data.',
        )}
      </p>
      <LegalLinks />
    </section>
  );
}

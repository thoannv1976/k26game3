import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState icon="🔎" title={t('common.notFoundTitle')} action={<Link className="font-semibold text-primary underline" to="/">{t('common.goHome')}</Link>}>
      {t('common.notFoundBody')}
    </EmptyState>
  );
}

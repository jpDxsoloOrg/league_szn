import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './BackLink.css';

type BackLinkProps = {
  to: string;
  label?: string;
};

export default function BackLink({ to, label }: BackLinkProps) {
  const { t } = useTranslation();
  return (
    <Link to={to} className="back-link" aria-label={label ?? t('common.back')}>
      ← {label ?? t('common.back')}
    </Link>
  );
}

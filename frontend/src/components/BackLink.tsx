import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type BackLinkProps = {
  to: string;
  label?: string;
  className?: string;
};

export default function BackLink({ to, label, className = 'back-link' }: BackLinkProps) {
  const { t } = useTranslation();
  return (
    <Link to={to} className={className}>
      {'\u2190'} {label ?? t('common.back', 'Back')}
    </Link>
  );
}

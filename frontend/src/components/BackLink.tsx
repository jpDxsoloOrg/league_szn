import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './BackLink.css';

type BackLinkProps = {
  to: string;
  label?: string;
};

export default function BackLink({ to, label }: BackLinkProps) {
  const { t } = useTranslation();
  const text = label ?? t('common.back', '← Back');
  return (
    <Link to={to} className="back-link">
      {text}
    </Link>
  );
}

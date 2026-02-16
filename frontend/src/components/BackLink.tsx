import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './BackLink.css';

type BackLinkProps = {
  to?: string;
  label?: string;
};

export default function BackLink({ to, label }: BackLinkProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const text = label ?? t('common.back', 'Back');

  if (to) {
    return (
      <Link to={to} className="back-link">
        ← {text}
      </Link>
    );
  }
  return (
    <button type="button" className="back-link back-link-button" onClick={() => navigate(-1)}>
      ← {text}
    </button>
  );
}

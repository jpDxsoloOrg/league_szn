import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPageInfo } from '../config/navConfig';
import './TopBar.css';

export default function TopBar() {
  const { t } = useTranslation();
  const location = useLocation();

  const { title, parent } = getPageInfo(location.pathname, t);

  return (
    <div className="top-bar">
      {parent ? (
        <div className="top-bar-breadcrumb">
          <span className="top-bar-parent">{parent}</span>
          <span className="top-bar-separator">/</span>
          <span className="top-bar-title">{title}</span>
        </div>
      ) : (
        <span className="top-bar-title">{title}</span>
      )}
    </div>
  );
}

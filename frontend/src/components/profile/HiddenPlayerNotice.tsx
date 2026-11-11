import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import '../MeForms.css';
import './HiddenPlayerNotice.css';

interface HiddenPlayerNoticeProps {
  title: string;
  body: string;
}

/** Tells a hidden player why a page is closed to them and sends them to set their wrestler name. */
export default function HiddenPlayerNotice({ title, body }: HiddenPlayerNoticeProps) {
  const { t } = useTranslation();

  return (
    <div className="me-alert me-alert--warn hidden-player-notice" role="status">
      <div className="hidden-player-notice__text">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <Button to="/profile" linkState={{ editProfile: true }}>{t('me.setup.enterName')}</Button>
    </div>
  );
}

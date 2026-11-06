import NotificationBell from '../NotificationBell';
import SearchLauncher from '../search/SearchLauncher';
import Wordmark from '../shell/Wordmark';
import './MobileHeader.css';

/**
 * Slim top bar for the mobile shell: wordmark, search and the notification
 * bell. NotificationBell gates itself on auth and the `notifications` flag.
 */
export default function MobileHeader() {
  return (
    <header className="mobile-header">
      <Wordmark />
      <div className="mobile-header__actions">
        <SearchLauncher compact />
        <NotificationBell />
      </div>
    </header>
  );
}

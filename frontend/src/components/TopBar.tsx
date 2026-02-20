import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNavLayout } from '../contexts/navLayoutContext';
import './TopBar.css';

export default function TopBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { mode, setMode } = useNavLayout();

  const getPageInfo = (): { title: string; parent?: string } => {
    const path = location.pathname;

    // Admin routes with breadcrumbs
    if (path.startsWith('/admin')) {
      const tab = path.split('/')[2];
      if (!tab) return { title: t('admin.panel.title') };

      const adminTabMap: Record<string, string> = {
        schedule: t('admin.panel.tabs.scheduleMatch'),
        results: t('admin.panel.tabs.recordResults'),
        events: t('admin.panel.tabs.events'),
        'match-config': t('admin.panel.tabs.matchConfig'),
        seasons: t('admin.panel.tabs.seasons'),
        players: t('admin.panel.tabs.managePlayers'),
        divisions: t('admin.panel.tabs.divisions'),
        championships: t('admin.panel.tabs.championships'),
        tournaments: t('admin.panel.tabs.tournaments'),
        challenges: t('admin.panel.tabs.challenges'),
        promos: t('admin.panel.tabs.promos'),
        'contender-config': t('admin.panel.tabs.contenderConfig'),
        'fantasy-shows': t('admin.panel.tabs.fantasyShows'),
        'fantasy-config': t('admin.panel.tabs.fantasyConfig'),
        users: t('admin.panel.tabs.users'),
        features: t('admin.panel.tabs.features'),
        danger: t('admin.panel.tabs.dangerZone'),
      };

      const tabToGroup: Record<string, string> = {
        schedule: t('admin.panel.groups.matchOps'),
        results: t('admin.panel.groups.matchOps'),
        events: t('admin.panel.groups.matchOps'),
        'match-config': t('admin.panel.groups.matchOps'),
        players: t('admin.panel.groups.leagueSetup'),
        divisions: t('admin.panel.groups.leagueSetup'),
        seasons: t('admin.panel.groups.leagueSetup'),
        championships: t('admin.panel.groups.leagueSetup'),
        tournaments: t('admin.panel.groups.leagueSetup'),
        challenges: t('admin.panel.groups.contentSocial'),
        promos: t('admin.panel.groups.contentSocial'),
        'contender-config': t('admin.panel.groups.contentSocial'),
        'fantasy-shows': t('admin.panel.groups.fantasy'),
        'fantasy-config': t('admin.panel.groups.fantasy'),
        users: t('admin.panel.groups.system'),
        features: t('admin.panel.groups.system'),
        danger: t('admin.panel.groups.system'),
      };

      const groupName = tabToGroup[tab];
      return {
        title: adminTabMap[tab] || t('admin.panel.title'),
        parent: groupName ? `${t('nav.admin')} / ${groupName}` : t('nav.admin'),
      };
    }

    // Events sub-routes
    if (path.match(/^\/events\/[^/]+\/results/)) {
      return { title: t('events.results.title'), parent: t('nav.events') };
    }
    if (path.match(/^\/events\/[^/]+/)) {
      return { title: t('events.detail.matchCard'), parent: t('nav.events') };
    }

    // Contender sub-routes
    if (path === '/contenders/my-status') {
      return { title: t('contenders.myStatus.title'), parent: t('nav.contenders') };
    }

    // Fantasy sub-routes
    if (path.startsWith('/fantasy/')) {
      const segment = path.split('/')[2] ?? '';
      const fantasyMap: Record<string, string> = {
        login: t('fantasy.auth.loginTitle'),
        signup: t('fantasy.auth.signupTitle'),
        dashboard: t('fantasy.dashboard.welcome', { username: '' }).replace(', !', ''),
        picks: t('fantasy.picks.title'),
        leaderboard: t('fantasy.leaderboard.title'),
        costs: t('fantasy.costs.title'),
        shows: t('fantasy.results.yourPoints'),
      };
      return {
        title: fantasyMap[segment] || t('nav.fantasy'),
        parent: t('nav.fantasy'),
      };
    }

    // Stats sub-routes
    if (path.startsWith('/stats/')) {
      const segment = path.split('/')[2] ?? '';
      const statsMap: Record<string, string> = {
        player: t('statistics.playerStats.title'),
        'head-to-head': t('statistics.headToHead.title'),
        leaderboards: t('statistics.leaderboards.title'),
        records: t('statistics.recordBook.title'),
        'tale-of-tape': t('statistics.taleOfTape.title'),
        achievements: t('statistics.achievements.title'),
      };
      return {
        title: statsMap[segment] || t('nav.statistics'),
        parent: t('nav.statistics'),
      };
    }

    // Challenge sub-routes
    // /challenges/issue now redirects to /promos/new — breadcrumb unreachable but kept for safety
    if (path === '/challenges/my') {
      return { title: t('challenges.my.title'), parent: t('nav.challenges') };
    }
    if (path.match(/^\/challenges\/[^/]+/)) {
      return { title: t('challenges.detail.title'), parent: t('nav.challenges') };
    }

    // Promo sub-routes
    if (path === '/promos/new') {
      return { title: t('promos.editor.title'), parent: t('nav.promos') };
    }
    if (path.match(/^\/promos\/[^/]+/)) {
      return { title: t('promos.thread.title'), parent: t('nav.promos') };
    }

    // Top-level routes
    const topLevelMap: Record<string, string> = {
      '/': t('nav.dashboard'),
      '/standings': t('nav.standings'),
      '/championships': t('nav.championships'),
      '/tournaments': t('nav.tournaments'),
      '/events': t('nav.events'),
      '/matches': t('nav.matchSearch'),
      '/contenders': t('nav.contenders'),
      '/challenges': t('nav.challenges'),
      '/promos': t('nav.promos'),
      '/stats': t('statistics.playerStats.title'),
      '/fantasy': t('nav.fantasy'),
      '/guide': t('nav.help'),
    };

    return { title: topLevelMap[path] || 'Page' };
  };

  const { title, parent } = getPageInfo();

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
      {mode === 'sidebar' && (
        <button
          type="button"
          className="top-bar-layout-toggle"
          onClick={() => setMode('topnav')}
          aria-label="Switch to top menu"
          title={t('nav.switchToTopMenu')}
        >
          {t('nav.switchToTopMenu')}
        </button>
      )}
    </div>
  );
}

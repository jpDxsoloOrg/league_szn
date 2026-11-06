import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { DashboardChampion } from '../types';
import EmptyState from './ui/EmptyState';
import PhotoTile from './ui/PhotoTile';
import type { TileAccent } from './ui/PhotoTile';
import SwipeRow from './ui/SwipeRow';
import HomeSection from './home/HomeSection';
import './ChampionCarousel.css';

const MS_PER_DAY = 86_400_000;

/** Titles the league names after a known belt keep that belt's rim colour. */
const TITLE_RIMS: { pattern: RegExp; accent: TileAccent }[] = [
  { pattern: /\btag\b/i, accent: 'tag' },
  { pattern: /\bworld\b|\bheavyweight\b|\buniversal\b|\bundisputed\b/i, accent: 'world' },
  { pattern: /\bunited states\b|\bu\.?s\.?\b/i, accent: 'us' },
  { pattern: /\bintercontinental\b|\bic\b/i, accent: 'ic' },
];

/** Other titles rotate through these, leaving gold to the world title. */
const FALLBACK_RIMS: TileAccent[] = ['us', 'ic', 'tag'];

function getTitleRim(championshipName: string, index: number): TileAccent {
  const known = TITLE_RIMS.find(({ pattern }) => pattern.test(championshipName));
  return known?.accent ?? FALLBACK_RIMS[index % FALLBACK_RIMS.length] ?? 'none';
}

function getReignDays(wonDate?: string): number | null {
  if (!wonDate) return null;
  const elapsed = Date.now() - new Date(wonDate).getTime();
  return Number.isNaN(elapsed) ? null : Math.max(0, Math.floor(elapsed / MS_PER_DAY));
}

/** World title first; otherwise the order the API sends. */
function orderChampions(champions: DashboardChampion[]): DashboardChampion[] {
  const isWorldTitle = (champion: DashboardChampion) => /world heavyweight/i.test(champion.championshipName);
  return [...champions.filter(isWorldTitle), ...champions.filter((champion) => !isWorldTitle(champion))];
}

export default function ChampionCarousel({ champions }: { champions: DashboardChampion[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (champions.length === 0) {
    return (
      <HomeSection title={t('dashboard.champions')}>
        <EmptyState
          title={t('dashboard.noChampions')}
          actionLabel={t('dashboard.emptyActions.viewChampionships', 'View championships')}
          onAction={() => navigate('/championships')}
        />
      </HomeSection>
    );
  }

  const describeReign = (champion: DashboardChampion): string | undefined => {
    const days = getReignDays(champion.wonDate);
    if (days === null) return undefined;
    const reign = t('home.reignDays', { count: days });
    return champion.defenses == null ? reign : `${reign} · ${t('home.defenses', { count: champion.defenses })}`;
  };

  return (
    <HomeSection title={t('dashboard.champions')} linkTo="/championships" linkLabel={t('home.allTitles')}>
      <SwipeRow label={t('dashboard.champions')} className="champion-row">
        {orderChampions(champions).map((champion, index) => (
          <PhotoTile
            key={champion.championshipId}
            to="/championships"
            imageUrl={champion.championImageUrl}
            title={champion.championName}
            eyebrow={champion.championshipName}
            meta={describeReign(champion)}
            accent={getTitleRim(champion.championshipName, index)}
          />
        ))}
      </SwipeRow>
    </HomeSection>
  );
}

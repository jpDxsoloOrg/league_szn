import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { PromoWithContext } from '../../../types/promo';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const t: Record<string, string> = {
        'promos.types.open-mic': 'Open Mic',
        'promos.types.call-out': 'Call-Out',
        'promos.types.response': 'Response',
        'promos.card.pinned': 'Pinned',
        'promos.card.callingOut': 'Calling out',
        'promos.card.respondingTo': 'Responding to',
        'promos.card.aPromo': 'a promo',
        'promos.card.by': 'by',
        'promos.card.response': 'response',
        'promos.card.responses': 'responses',
        'promos.card.viewThread': 'View Thread',
        'promos.reactions.fire': 'Fire',
        'promos.reactions.mic': 'Mic Drop',
        'promos.reactions.trash': 'Trash',
        'promos.reactions.mind-blown': 'Mind Blown',
        'promos.reactions.clap': 'Clap',
      };
      return t[key] || (typeof fallback === 'string' ? fallback : key);
    },
  }),
}));

vi.mock('../PromoCard.css', () => ({}));
vi.mock('../PromoReactions.css', () => ({}));

import PromoCard from '../PromoCard';

const defaultCounts = { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 } as const;

function makePromo(overrides: Partial<PromoWithContext> = {}): PromoWithContext {
  return {
    promoId: 'promo-1',
    playerId: 'p-1',
    promoType: 'open-mic',
    content: 'This is my epic promo speech!',
    reactions: {},
    reactionCounts: { ...defaultCounts },
    isPinned: false,
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    playerName: 'John',
    wrestlerName: 'Stone Cold',
    responseCount: 0,
    ...overrides,
  };
}

function renderCard(promo: PromoWithContext, onReact?: (promoId: string, reaction: import('../../../types/promo').ReactionType) => void) {
  return render(
    <BrowserRouter>
      <PromoCard promo={promo} onReact={onReact} />
    </BrowserRouter>
  );
}

describe('PromoCard', () => {
  it('displays promo content, wrestler name, player name, and type badge', () => {
    const promo = makePromo({
      title: 'The Best Promo',
      content: 'I am the greatest of all time!',
      wrestlerName: 'Stone Cold',
      playerName: 'John',
      promoType: 'open-mic',
    });

    renderCard(promo);

    expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    expect(screen.getByText('(John)')).toBeInTheDocument();
    expect(screen.getByText('Open Mic')).toBeInTheDocument();
    expect(screen.getByText('The Best Promo')).toBeInTheDocument();
    expect(screen.getByText(/I am the greatest of all time!/)).toBeInTheDocument();
  });

  it('shows reaction buttons with counts', () => {
    const promo = makePromo({
      reactionCounts: { fire: 5, mic: 2, trash: 0, 'mind-blown': 1, clap: 3 },
    });

    renderCard(promo);

    // Reaction buttons should be rendered with correct counts
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText('Fire')).toBeInTheDocument();
    expect(screen.getByLabelText('Mic Drop')).toBeInTheDocument();
    expect(screen.getByLabelText('Clap')).toBeInTheDocument();
  });

  it('shows thread link when there are responses', () => {
    const promo = makePromo({ responseCount: 3 });

    renderCard(promo);

    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/responses/)).toBeInTheDocument();
    expect(screen.getByText(/View Thread/)).toBeInTheDocument();
  });
});

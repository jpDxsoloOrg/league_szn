import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactionType } from '../../types/promo';
import { REACTION_EMOJI, REACTION_LABELS } from '../../mocks/promoMockData';
import './PromoReactions.css';

interface PromoReactionsProps {
  reactionCounts: Record<ReactionType, number>;
  onReact?: (reaction: ReactionType) => void;
}

const REACTION_TYPES: ReactionType[] = ['fire', 'mic', 'trash', 'mind-blown', 'clap'];

export default function PromoReactions({ reactionCounts, onReact }: PromoReactionsProps) {
  const { t } = useTranslation();
  const [activeReactions, setActiveReactions] = useState<Set<ReactionType>>(new Set());
  const [counts, setCounts] = useState<Record<ReactionType, number>>({ ...reactionCounts });

  const handleReaction = (reaction: ReactionType) => {
    setActiveReactions((prev) => {
      const next = new Set(prev);
      if (next.has(reaction)) {
        next.delete(reaction);
        setCounts((c) => ({ ...c, [reaction]: Math.max(0, c[reaction] - 1) }));
      } else {
        next.add(reaction);
        setCounts((c) => ({ ...c, [reaction]: c[reaction] + 1 }));
      }
      return next;
    });
    onReact?.(reaction);
  };

  return (
    <div className="promo-reactions">
      {REACTION_TYPES.map((reaction) => (
        <button
          key={reaction}
          className={`reaction-btn ${activeReactions.has(reaction) ? 'active' : ''}`}
          onClick={() => handleReaction(reaction)}
          title={t(`promos.reactions.${reaction}`, REACTION_LABELS[reaction])}
          aria-label={REACTION_LABELS[reaction]}
        >
          <span className="reaction-emoji">{REACTION_EMOJI[reaction]}</span>
          <span className="reaction-count">{counts[reaction]}</span>
        </button>
      ))}
    </div>
  );
}

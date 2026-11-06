import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactionType } from '../../types/promo';
import './PromoReactions.css';

const REACTION_EMOJI: Record<ReactionType, string> = {
  fire: '\u{1F525}',
  mic: '\u{1F3A4}',
  trash: '\u{1F5D1}',
  'mind-blown': '\u{1F92F}',
  clap: '\u{1F44F}',
};

const REACTION_LABELS: Record<ReactionType, string> = {
  fire: 'Fire',
  mic: 'Mic Drop',
  trash: 'Trash',
  'mind-blown': 'Mind Blown',
  clap: 'Clap',
};

interface PromoReactionsProps {
  reactionCounts: Record<ReactionType, number>;
  /** Without a handler the counts are read-only, as in the editor preview. */
  onReact?: (reaction: ReactionType) => void;
}

const REACTION_TYPES: ReactionType[] = ['fire', 'mic', 'trash', 'mind-blown', 'clap'];

export default function PromoReactions({ reactionCounts, onReact }: PromoReactionsProps) {
  const { t } = useTranslation();
  // The API keeps one reaction per user, so a new pick replaces the last one.
  const [activeReaction, setActiveReaction] = useState<ReactionType | null>(null);
  const [counts, setCounts] = useState<Record<ReactionType, number>>({ ...reactionCounts });

  useEffect(() => {
    setCounts({ ...reactionCounts });
  }, [reactionCounts]);

  const handleReaction = (reaction: ReactionType) => {
    const next = activeReaction === reaction ? null : reaction;
    setCounts((current) => {
      const updated = { ...current };
      if (activeReaction) updated[activeReaction] = Math.max(0, updated[activeReaction] - 1);
      if (next) updated[next] += 1;
      return updated;
    });
    setActiveReaction(next);
    onReact?.(reaction);
  };

  return (
    <div className="promo-reactions">
      {REACTION_TYPES.map((reaction) => {
        const label = t(`promos.reactions.${reaction}`, REACTION_LABELS[reaction]);
        return (
          <button
            key={reaction}
            type="button"
            className={`reaction-btn ${activeReaction === reaction ? 'active' : ''}`}
            onClick={() => handleReaction(reaction)}
            disabled={!onReact}
            title={label}
            aria-label={label}
            aria-pressed={activeReaction === reaction}
          >
            <span className="reaction-emoji" aria-hidden="true">{REACTION_EMOJI[reaction]}</span>
            <span className="reaction-count">{counts[reaction]}</span>
          </button>
        );
      })}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import type { WrestlerMove } from '../../types';
import { displayMoveName } from '../../utils/movesets';
import './MoveList.css';

export interface MoveListProps {
  title: string;
  moves: WrestlerMove[] | undefined;
  /** Shown when the list is empty. Omit to render nothing for empty lists. */
  emptyText?: string;
}

/**
 * Read-only signatures/finishers list. The commentary name is the headline;
 * the in-game name sits beneath in muted text when the two differ.
 */
export default function MoveList({ title, moves, emptyText }: MoveListProps) {
  const { t } = useTranslation();
  const list = (moves ?? []).filter((m) => m.gameName.trim().length > 0);

  if (list.length === 0 && !emptyText) return null;

  return (
    <section className="move-list">
      <h4 className="move-list-title">{title}</h4>
      {list.length === 0 ? (
        <p className="move-list-empty">{emptyText}</p>
      ) : (
        <ol className="move-list-items">
          {list.map((move, index) => {
            const name = displayMoveName(move);
            const showGame = name !== move.gameName;
            return (
              <li key={`${move.gameName}-${index}`} className="move-list-item">
                <span className="move-list-name">{name}</span>
                {showGame && (
                  <span className="move-list-game">
                    {t('profile.moves.inGame', { name: move.gameName })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

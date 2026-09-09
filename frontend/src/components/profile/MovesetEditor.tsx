import { useTranslation } from 'react-i18next';
import { MAX_MOVE_NAME_LENGTH, type WrestlerMove } from '../../types';
import { padMoves } from '../../utils/movesets';
import './MovesetEditor.css';

export interface MovesetEditorProps {
  /** Group label, e.g. "Signature Moves". */
  label: string;
  /** Short line under the label, e.g. "Add at least one signature". */
  helperText?: string;
  /** Prefix for input ids so two editors on one page stay unique. */
  idPrefix: string;
  value: WrestlerMove[];
  onChange: (moves: WrestlerMove[]) => void;
  disabled?: boolean;
}

/**
 * Fixed five-row editor for signatures or finishers. Each row is the
 * in-game move name plus what the player wants it called on commentary.
 * Always emits a padded five-element array; callers compact before saving.
 */
export default function MovesetEditor({
  label,
  helperText,
  idPrefix,
  value,
  onChange,
  disabled = false,
}: MovesetEditorProps) {
  const { t } = useTranslation();
  const rows = padMoves(value);

  const updateRow = (index: number, field: keyof WrestlerMove, text: string) => {
    const next = rows.map((row, i) => (i === index ? { ...row, [field]: text } : row));
    onChange(next);
  };

  return (
    <fieldset className="moveset-editor" disabled={disabled}>
      <legend className="moveset-editor-legend">{label}</legend>
      {helperText && <p className="moveset-editor-helper">{helperText}</p>}
      <div className="moveset-editor-header" aria-hidden="true">
        <span />
        <span>{t('profile.moves.gameName')}</span>
        <span>{t('profile.moves.customName')}</span>
      </div>
      <ol className="moveset-editor-rows">
        {rows.map((row, index) => {
          const gameId = `${idPrefix}-${index}-game`;
          const customId = `${idPrefix}-${index}-custom`;
          const rowLabel = `${label} ${index + 1}`;
          return (
            <li key={index} className="moveset-editor-row">
              <span className="moveset-editor-index">{index + 1}</span>
              <input
                type="text"
                id={gameId}
                className="moveset-editor-input"
                aria-label={`${rowLabel} — ${t('profile.moves.gameName')}`}
                value={row.gameName}
                maxLength={MAX_MOVE_NAME_LENGTH}
                placeholder={t('profile.moves.gameNamePlaceholder')}
                onChange={(e) => updateRow(index, 'gameName', e.target.value)}
              />
              <input
                type="text"
                id={customId}
                className="moveset-editor-input"
                aria-label={`${rowLabel} — ${t('profile.moves.customName')}`}
                value={row.customName}
                maxLength={MAX_MOVE_NAME_LENGTH}
                placeholder={row.gameName.trim() || t('profile.moves.customNamePlaceholder')}
                onChange={(e) => updateRow(index, 'customName', e.target.value)}
              />
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_MOVES } from '../../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../MovesetEditor.css', () => ({}));

import MovesetEditor from '../MovesetEditor';

describe('MovesetEditor', () => {
  it('always renders five rows with two inputs each', () => {
    render(
      <MovesetEditor label="Signature Moves" idPrefix="sig" value={[]} onChange={() => {}} />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(MAX_MOVES);
    expect(screen.getAllByRole('textbox')).toHaveLength(MAX_MOVES * 2);
  });

  it('shows existing moves in order and pads the rest', () => {
    render(
      <MovesetEditor
        label="Finishers"
        idPrefix="fin"
        value={[{ gameName: 'Cross Rhodes', customName: 'CR' }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Finishers 1 — profile.moves.gameName')).toHaveValue('Cross Rhodes');
    expect(screen.getByLabelText('Finishers 1 — profile.moves.customName')).toHaveValue('CR');
    expect(screen.getByLabelText('Finishers 2 — profile.moves.gameName')).toHaveValue('');
  });

  it('emits the full padded array with the edited row changed', async () => {
    const onChange = vi.fn();
    render(<MovesetEditor label="Signature Moves" idPrefix="sig" value={[]} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Signature Moves 3 — profile.moves.gameName'), 'C');

    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls.at(-1)![0];
    expect(emitted).toHaveLength(MAX_MOVES);
    expect(emitted[2]).toEqual({ gameName: 'C', customName: '' });
    expect(emitted[0]).toEqual({ gameName: '', customName: '' });
  });

  it('uses the in-game name as the custom-name placeholder once typed', () => {
    render(
      <MovesetEditor
        label="Signature Moves"
        idPrefix="sig"
        value={[{ gameName: 'Cody Cutter', customName: '' }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Signature Moves 1 — profile.moves.customName')).toHaveAttribute(
      'placeholder',
      'Cody Cutter',
    );
  });
});

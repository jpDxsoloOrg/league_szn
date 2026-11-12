import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockTagTeamsApi, mockImagesApi } = vi.hoisted(() => ({
  mockTagTeamsApi: { adminCreate: vi.fn() },
  mockImagesApi: { generateUploadUrl: vi.fn(), uploadToS3: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api/tagTeams.api', () => ({ tagTeamsApi: mockTagTeamsApi }));
vi.mock('../../../services/api', async () => {
  const { ApiError, isApiError } = await import('../../../services/api/apiClient');
  return { ApiError, isApiError, imagesApi: mockImagesApi };
});

import CreateTagTeamAdminModal from '../CreateTagTeamAdminModal';
import { ApiError } from '../../../services/api/apiClient';
import type { Player } from '../../../types';
import type { TagTeam } from '../../../types/tagTeam';

const player = (playerId: string, name: string, currentWrestler: string): Player => ({
  playerId, name, currentWrestler, wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '',
});

const players: Player[] = [
  player('p1', 'Jey', 'Jey Uso'),
  player('p2', 'Jimmy', 'Jimmy Uso'),
  player('p3', 'Kofi', 'Kofi Kingston'),
  player('p4', 'Xavier', 'Xavier Woods'),
];

const team = (overrides: Partial<TagTeam>): TagTeam => ({
  tagTeamId: 't1', name: 'Team', player1Id: 'p1', player2Id: 'p2', status: 'active',
  wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '', ...overrides,
});

// Kofi and Xavier are already New Day; Jey and Jimmy are free.
const tagTeams: TagTeam[] = [team({ tagTeamId: 'nd', name: 'New Day', player1Id: 'p3', player2Id: 'p4' })];

function renderModal(overrides: Partial<Parameters<typeof CreateTagTeamAdminModal>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    players,
    tagTeams,
    onCreated: vi.fn(),
    onStale: vi.fn(),
    ...overrides,
  };
  render(<CreateTagTeamAdminModal {...props} />);
  return props;
}

async function pickPlayer(user: ReturnType<typeof userEvent.setup>, field: 'Player 1' | 'Player 2', optionName: RegExp) {
  await user.click(screen.getByLabelText(field));
  await user.click(screen.getByRole('option', { name: optionName }));
}

describe('CreateTagTeamAdminModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the team with both players and notify on by default', async () => {
    const user = userEvent.setup();
    const created = { ...team({ tagTeamId: 'new', name: 'The Usos' }), supersededTagTeamIds: [] };
    mockTagTeamsApi.adminCreate.mockResolvedValue(created);
    const props = renderModal();

    await user.type(screen.getByLabelText('Team name'), 'The Usos');
    await pickPlayer(user, 'Player 1', /^Jey Uso \(Jey\)/);
    await pickPlayer(user, 'Player 2', /^Jimmy Uso \(Jimmy\)/);
    expect(screen.getByRole('checkbox', { name: 'Notify players' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Create Tag Team' }));

    await waitFor(() => expect(mockTagTeamsApi.adminCreate).toHaveBeenCalledWith({
      name: 'The Usos',
      player1Id: 'p1',
      player2Id: 'p2',
      notifyPlayers: true,
    }));
    expect(props.onCreated).toHaveBeenCalledWith(created);
    expect(mockImagesApi.generateUploadUrl).not.toHaveBeenCalled();
  });

  it('sends notifyPlayers false when the box is cleared', async () => {
    const user = userEvent.setup();
    mockTagTeamsApi.adminCreate.mockResolvedValue({ ...team({}), supersededTagTeamIds: [] });
    renderModal();

    await user.type(screen.getByLabelText('Team name'), 'The Usos');
    await pickPlayer(user, 'Player 1', /^Jey Uso/);
    await pickPlayer(user, 'Player 2', /^Jimmy Uso/);
    await user.click(screen.getByRole('checkbox', { name: 'Notify players' }));
    await user.click(screen.getByRole('button', { name: 'Create Tag Team' }));

    await waitFor(() => expect(mockTagTeamsApi.adminCreate).toHaveBeenCalledWith(
      expect.objectContaining({ notifyPlayers: false }),
    ));
  });

  it('disables players already on an active team and names the team', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByLabelText('Player 1'));
    const kofi = screen.getByRole('option', { name: /Kofi Kingston/ });
    expect(kofi).toHaveAttribute('aria-disabled', 'true');
    expect(kofi).toHaveTextContent('(in New Day)');
    expect(screen.getByRole('option', { name: /Jey Uso/ })).not.toHaveAttribute('aria-disabled');

    await user.click(kofi);
    // Clicking a disabled option does not select it, so the list stays open.
    expect(screen.getByLabelText('Player 1')).toHaveValue('');
  });

  it('leaves the player picked in one slot out of the other', async () => {
    const user = userEvent.setup();
    renderModal();

    await pickPlayer(user, 'Player 1', /^Jey Uso/);
    await user.click(screen.getByLabelText('Player 2'));
    expect(screen.queryByRole('option', { name: /Jey Uso/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Jimmy Uso/ })).toBeInTheDocument();
  });

  it('asks for the missing fields without calling the API', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Create Tag Team' }));

    expect(await screen.findByText('Enter a team name.')).toBeInTheDocument();
    expect(screen.getAllByText('Pick a player.')).toHaveLength(2);
    expect(mockTagTeamsApi.adminCreate).not.toHaveBeenCalled();
  });

  it('shows a player conflict from the API under that player, and asks for a reload', async () => {
    const user = userEvent.setup();
    mockTagTeamsApi.adminCreate.mockRejectedValue(new ApiError('Jimmy Uso is already in the active tag team "Bloodline"', 409, {
      code: 'PLAYER_IN_ACTIVE_TAG_TEAM',
      body: {
        code: 'PLAYER_IN_ACTIVE_TAG_TEAM',
        playerId: 'p2',
        conflictingTagTeam: { tagTeamId: 'bl', name: 'Bloodline' },
      },
    }));
    const props = renderModal();

    await user.type(screen.getByLabelText('Team name'), 'The Usos');
    await pickPlayer(user, 'Player 1', /^Jey Uso/);
    await pickPlayer(user, 'Player 2', /^Jimmy Uso/);
    await user.click(screen.getByRole('button', { name: 'Create Tag Team' }));

    const message = await screen.findByText('Jimmy Uso (Jimmy) is already in the active tag team "Bloodline".');
    expect(screen.getByLabelText('Player 2')).toHaveAttribute('aria-describedby', message.id);
    expect(screen.getByLabelText('Player 2')).toHaveAttribute('aria-invalid', 'true');
    expect(props.onStale).toHaveBeenCalled();
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it('shows a taken name under the name field', async () => {
    const user = userEvent.setup();
    mockTagTeamsApi.adminCreate.mockRejectedValue(new ApiError('An active tag team is already named "New Day"', 409, {
      code: 'TAG_TEAM_NAME_TAKEN',
      body: { code: 'TAG_TEAM_NAME_TAKEN', conflictingTagTeam: { tagTeamId: 'nd', name: 'New Day' } },
    }));
    renderModal();

    await user.type(screen.getByLabelText('Team name'), 'new day');
    await pickPlayer(user, 'Player 1', /^Jey Uso/);
    await pickPlayer(user, 'Player 2', /^Jimmy Uso/);
    await user.click(screen.getByRole('button', { name: 'Create Tag Team' }));

    expect(await screen.findByText('An active tag team is already named "New Day".')).toBeInTheDocument();
    expect(screen.getByLabelText('Team name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows any other refusal at the top of the form', async () => {
    const user = userEvent.setup();
    mockTagTeamsApi.adminCreate.mockRejectedValue(new ApiError('This player is deactivated.', 409, {
      code: 'PLAYER_DEACTIVATED',
      body: { code: 'PLAYER_DEACTIVATED' },
    }));
    renderModal();

    await user.type(screen.getByLabelText('Team name'), 'The Usos');
    await pickPlayer(user, 'Player 1', /^Jey Uso/);
    await pickPlayer(user, 'Player 2', /^Jimmy Uso/);
    await user.click(screen.getByRole('button', { name: 'Create Tag Team' }));

    expect(await screen.findByText('This player is deactivated.')).toBeInTheDocument();
  });

  it('uploads a chosen image to the tag-teams folder and sends its URL', async () => {
    const user = userEvent.setup();
    mockImagesApi.generateUploadUrl.mockResolvedValue({ uploadUrl: 'https://s3/put', imageUrl: 'https://cdn/usos.png', fileKey: 'k' });
    mockImagesApi.uploadToS3.mockResolvedValue(undefined);
    mockTagTeamsApi.adminCreate.mockResolvedValue({ ...team({}), supersededTagTeamIds: [] });
    renderModal();

    await user.type(screen.getByLabelText('Team name'), 'The Usos');
    await pickPlayer(user, 'Player 1', /^Jey Uso/);
    await pickPlayer(user, 'Player 2', /^Jimmy Uso/);
    const file = new File(['img'], 'usos.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Team image (optional)'), file);
    await user.click(screen.getByRole('button', { name: 'Create Tag Team' }));

    await waitFor(() => expect(mockTagTeamsApi.adminCreate).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: 'https://cdn/usos.png' }),
    ));
    expect(mockImagesApi.generateUploadUrl).toHaveBeenCalledWith('usos.png', 'image/png', 'tag-teams');
    expect(mockImagesApi.uploadToS3).toHaveBeenCalledWith('https://s3/put', file);
  });
});

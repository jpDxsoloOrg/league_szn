import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

const {
  mockGetMyProfile,
  mockFactionsGetById,
  mockFactionsGetAll,
  mockFactionsGetInvitations,
  mockFactionsRemoveMember,
  mockFactionsUpdate,
  mockGenerateUploadUrl,
  mockUploadToS3,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockGetMyProfile: vi.fn(),
  mockFactionsGetById: vi.fn(),
  mockFactionsGetAll: vi.fn(),
  mockFactionsGetInvitations: vi.fn(),
  mockFactionsRemoveMember: vi.fn(),
  mockFactionsUpdate: vi.fn(),
  mockGenerateUploadUrl: vi.fn(),
  mockUploadToS3: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  profileApi: {
    getMyProfile: mockGetMyProfile,
  },
  factionsApi: {
    getById: mockFactionsGetById,
    getAll: mockFactionsGetAll,
    getInvitations: mockFactionsGetInvitations,
    removeMember: mockFactionsRemoveMember,
    update: mockFactionsUpdate,
    disband: vi.fn(),
    leave: vi.fn(),
    respondToInvitation: vi.fn(),
  },
  imagesApi: {
    generateUploadUrl: mockGenerateUploadUrl,
    uploadToS3: mockUploadToS3,
  },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

// Translation mock that interpolates {{var}} placeholders so we can assert
// against the rendered strings (player + faction names in the modal).
const interpolatingT = (_key: string, fallback?: string, options?: Record<string, unknown>) => {
  let text = fallback ?? _key;
  if (options) {
    for (const [name, value] of Object.entries(options)) {
      text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
    }
  }
  return text;
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: interpolatingT }),
}));

vi.mock('../MyFaction.css', () => ({}));
vi.mock('../FactionImageUploader.css', () => ({}));
vi.mock('../CreateFactionModal', () => ({ default: () => null }));
vi.mock('../InviteToFactionModal', () => ({ default: () => null }));

import MyFaction from '../MyFaction';

const leaderProfile = {
  playerId: 'leader-1',
  name: 'Leader Player',
  currentWrestler: 'Leader Wrestler',
  wins: 0,
  losses: 0,
  draws: 0,
  stableId: 'fac-1',
  createdAt: '',
  updatedAt: '',
};

const memberProfile = {
  ...leaderProfile,
  playerId: 'member-1',
  name: 'Member Player',
  currentWrestler: 'Member Wrestler',
};

function makeMember(playerId: string, playerName: string, wrestlerName: string) {
  return {
    playerId,
    playerName,
    wrestlerName,
    wins: 0,
    losses: 0,
    draws: 0,
  };
}

function makeFaction(memberIds: string[]) {
  return {
    stableId: 'fac-1',
    name: 'New World Order',
    leaderId: 'leader-1',
    memberIds,
    status: 'active',
    wins: 5,
    losses: 1,
    draws: 0,
    createdAt: '',
    updatedAt: '',
    members: memberIds.map((id) => {
      if (id === 'leader-1') return makeMember('leader-1', 'Leader Player', 'Leader Wrestler');
      if (id === 'member-1') return makeMember('member-1', 'Member Player', 'Member Wrestler');
      if (id === 'member-2') return makeMember('member-2', 'Second Member', 'Second Wrestler');
      return makeMember(id, id, id);
    }),
    standings: { winPercentage: 0, recentForm: [], currentStreak: { type: 'W', count: 0 } },
    headToHead: [],
    matchTypeRecords: [],
    recentMatches: [],
  };
}

function renderMyFaction() {
  return render(
    <BrowserRouter>
      <MyFaction />
    </BrowserRouter>
  );
}

describe('MyFaction — FAC-02 Manage Members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockFactionsGetInvitations.mockResolvedValue([]);
    mockFactionsGetAll.mockResolvedValue([]);
  });

  it('shows the Manage Members panel when caller is the leader', async () => {
    mockGetMyProfile.mockResolvedValue(leaderProfile);
    mockFactionsGetById.mockResolvedValue(makeFaction(['leader-1', 'member-1', 'member-2']));

    renderMyFaction();

    const panel = await screen.findByTestId('manage-members');
    // Leader row is excluded; both non-leader members appear with a Remove button.
    expect(within(panel).queryByText('Leader Player')).toBeNull();
    expect(within(panel).getByText('Member Player')).toBeInTheDocument();
    expect(within(panel).getByText('Second Member')).toBeInTheDocument();
    expect(within(panel).getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
  });

  it('does not render Manage Members when the caller is not the leader', async () => {
    mockGetMyProfile.mockResolvedValue(memberProfile);
    mockFactionsGetById.mockResolvedValue(makeFaction(['leader-1', 'member-1', 'member-2']));

    renderMyFaction();

    // Wait for the faction detail to load (members panel for read-only view appears).
    await screen.findByText('New World Order');
    expect(screen.queryByTestId('manage-members')).toBeNull();
  });

  it('opens a confirmation modal when Remove is clicked on a non-leader member', async () => {
    mockGetMyProfile.mockResolvedValue(leaderProfile);
    mockFactionsGetById.mockResolvedValue(makeFaction(['leader-1', 'member-1', 'member-2']));

    const user = userEvent.setup();
    renderMyFaction();

    const panel = await screen.findByTestId('manage-members');
    const memberRow = within(panel).getByText('Member Player').closest('.my-faction__manage-member-row') as HTMLElement;
    await user.click(within(memberRow).getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove Member Player from New World Order?')).toBeInTheDocument();
    // 3-member faction: removing one leaves 2, no disband warning.
    expect(
      within(dialog).queryByText('This will disband the faction — only the leader would remain.')
    ).toBeNull();
  });

  it('calls factionsApi.removeMember with the correct args on confirm', async () => {
    mockGetMyProfile.mockResolvedValue(leaderProfile);
    mockFactionsGetById.mockResolvedValue(makeFaction(['leader-1', 'member-1', 'member-2']));
    mockFactionsRemoveMember.mockResolvedValue({
      message: 'ok',
      stableId: 'fac-1',
      removedPlayerId: 'member-1',
      remainingMembers: 2,
    });

    const user = userEvent.setup();
    renderMyFaction();

    const panel = await screen.findByTestId('manage-members');
    const memberRow = within(panel).getByText('Member Player').closest('.my-faction__manage-member-row') as HTMLElement;
    await user.click(within(memberRow).getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove member' }));

    await waitFor(() => {
      expect(mockFactionsRemoveMember).toHaveBeenCalledTimes(1);
    });
    expect(mockFactionsRemoveMember).toHaveBeenCalledWith('fac-1', 'member-1');
  });

  it('shows the disband warning when removing the last non-leader member', async () => {
    mockGetMyProfile.mockResolvedValue(leaderProfile);
    mockFactionsGetById.mockResolvedValue(makeFaction(['leader-1', 'member-1']));

    const user = userEvent.setup();
    renderMyFaction();

    const panel = await screen.findByTestId('manage-members');
    await user.click(within(panel).getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('This will disband the faction — only the leader would remain.')
    ).toBeInTheDocument();
  });
});

describe('MyFaction — FAC-03 Image upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockFactionsGetInvitations.mockResolvedValue([]);
    mockFactionsGetAll.mockResolvedValue([]);
  });

  it('uploads an image and calls factionsApi.update with the resulting URL', async () => {
    mockGetMyProfile.mockResolvedValue(leaderProfile);
    mockFactionsGetById.mockResolvedValue(makeFaction(['leader-1', 'member-1']));
    mockGenerateUploadUrl.mockResolvedValue({
      uploadUrl: 'https://s3.example.com/presigned',
      imageUrl: 'https://example.com/x.png',
      fileKey: 'factions/x.png',
    });
    mockUploadToS3.mockResolvedValue(undefined);
    mockFactionsUpdate.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderMyFaction();

    const uploader = await screen.findByTestId('faction-image-uploader');
    const fileInput = uploader.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file = new File(['fake-bytes'], 'banner.png', { type: 'image/png' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mockFactionsUpdate).toHaveBeenCalledTimes(1);
    });

    expect(mockGenerateUploadUrl).toHaveBeenCalledWith('banner.png', 'image/png', 'factions');
    expect(mockUploadToS3).toHaveBeenCalledWith('https://s3.example.com/presigned', file);
    expect(mockFactionsUpdate).toHaveBeenCalledWith('fac-1', { imageUrl: 'https://example.com/x.png' });

    // Calls happen in the documented order: presign → upload → persist.
    const presignOrder = mockGenerateUploadUrl.mock.invocationCallOrder[0];
    const uploadOrder = mockUploadToS3.mock.invocationCallOrder[0];
    const updateOrder = mockFactionsUpdate.mock.invocationCallOrder[0];
    expect(presignOrder).toBeLessThan(uploadOrder);
    expect(uploadOrder).toBeLessThan(updateOrder);
  });

  it('does not render the upload affordance when the caller is not the leader', async () => {
    mockGetMyProfile.mockResolvedValue(memberProfile);
    mockFactionsGetById.mockResolvedValue(makeFaction(['leader-1', 'member-1', 'member-2']));

    renderMyFaction();

    // Wait for the faction detail to load.
    await screen.findByText('New World Order');
    expect(screen.queryByTestId('faction-image-uploader')).toBeNull();
  });
});

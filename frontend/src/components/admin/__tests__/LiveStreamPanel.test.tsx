import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockLiveStreamApi } = vi.hoisted(() => ({
  mockLiveStreamApi: { get: vi.fn(), update: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({
  liveStreamApi: mockLiveStreamApi,
  LIVE_STREAM_MAX_HOURS: 8,
  LIVE_STREAM_TITLE_MAX_LENGTH: 120,
}));

import LiveStreamPanel from '../LiveStreamPanel';

const offline = { channel: 'leagueszn', isLive: false, title: 'Night 1' };

describe('LiveStreamPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLiveStreamApi.get.mockResolvedValue(offline);
  });

  it('loads the saved channel and title and shows the stream offline', async () => {
    render(<LiveStreamPanel />);

    expect(await screen.findByDisplayValue('leagueszn')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Night 1')).toBeInTheDocument();
    expect(screen.getByText('liveStream.admin.statusOffline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'liveStream.admin.goLive' })).toBeInTheDocument();
  });

  it('goes live with the channel and title', async () => {
    const user = userEvent.setup();
    mockLiveStreamApi.update.mockResolvedValue({ ...offline, isLive: true, liveSince: '2026-11-27T20:42:00.000Z' });
    render(<LiveStreamPanel />);
    await screen.findByDisplayValue('leagueszn');

    await user.click(screen.getByRole('button', { name: 'liveStream.admin.goLive' }));

    expect(mockLiveStreamApi.update).toHaveBeenCalledWith({ channel: 'leagueszn', title: 'Night 1', isLive: true });
    expect(await screen.findByRole('button', { name: 'liveStream.admin.endStream' })).toBeInTheDocument();
    expect(screen.getByText('liveStream.live')).toBeInTheDocument();
    expect(screen.getByText('liveStream.admin.statusLive')).toBeInTheDocument();
    expect(screen.getByText('liveStream.admin.autoOff')).toBeInTheDocument();
  });

  it('ends the stream', async () => {
    const user = userEvent.setup();
    mockLiveStreamApi.get.mockResolvedValue({ ...offline, isLive: true, liveSince: '2026-11-27T20:42:00.000Z' });
    mockLiveStreamApi.update.mockResolvedValue(offline);
    render(<LiveStreamPanel />);

    await user.click(await screen.findByRole('button', { name: 'liveStream.admin.endStream' }));

    expect(mockLiveStreamApi.update).toHaveBeenCalledWith({ isLive: false });
    expect(await screen.findByRole('button', { name: 'liveStream.admin.goLive' })).toBeInTheDocument();
  });

  it('refuses to go live without a channel', async () => {
    const user = userEvent.setup();
    mockLiveStreamApi.get.mockResolvedValue({ channel: '', isLive: false });
    render(<LiveStreamPanel />);

    await user.click(await screen.findByRole('button', { name: 'liveStream.admin.goLive' }));

    expect(await screen.findByText('liveStream.admin.channelRequired')).toBeInTheDocument();
    expect(mockLiveStreamApi.update).not.toHaveBeenCalled();
  });

  it('rejects a channel that is not a Twitch login', async () => {
    const user = userEvent.setup();
    render(<LiveStreamPanel />);
    const channel = await screen.findByDisplayValue('leagueszn');

    await user.clear(channel);
    await user.type(channel, 'no spaces!');
    await user.click(screen.getByRole('button', { name: 'liveStream.admin.save' }));

    expect(await screen.findByText('liveStream.admin.invalidChannel')).toBeInTheDocument();
    expect(mockLiveStreamApi.update).not.toHaveBeenCalled();
  });

  it('saves the settings without changing live state', async () => {
    const user = userEvent.setup();
    mockLiveStreamApi.update.mockResolvedValue({ ...offline, channel: 'newchannel' });
    render(<LiveStreamPanel />);
    const channel = await screen.findByDisplayValue('leagueszn');

    await user.clear(channel);
    await user.type(channel, 'NewChannel');
    await user.click(screen.getByRole('button', { name: 'liveStream.admin.save' }));

    await waitFor(() => expect(mockLiveStreamApi.update).toHaveBeenCalledWith({ channel: 'NewChannel', title: 'Night 1' }));
    expect(await screen.findByText('liveStream.admin.saved')).toBeInTheDocument();
  });
});
